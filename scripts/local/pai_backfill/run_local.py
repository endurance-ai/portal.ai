"""
PAI Backfill — Mac 로컬 Ollama (Qwen2.5-VL 등) 백필.

# @MX:NOTE: run_sync.py 의 Bedrock 의존성을 Ollama HTTP API (localhost:11434) 로 교체.
# @MX:NOTE: 개발 iteration / 비용 절감용. 80k 풀배치는 비현실적 (Mac GPU 단일,
#           ~10초/req @ Qwen 7B = 220h). 100~5k 검증용으로 쓰면 적절.

용법:
    # Ollama 설치 + 모델 다운로드 (한 번만)
    brew install ollama
    ollama serve &
    ollama pull qwen2.5vl:7b

    # 백필 실행 (workers=1 — Mac GPU 단일)
    python scripts/local/pai_backfill/run_local.py --limit 100 --dry-run
    python scripts/local/pai_backfill/run_local.py --limit 100
    python scripts/local/pai_backfill/run_local.py --model qwen2.5vl:32b --limit 100

비용 / 시간 (M5 Pro 48GB 기준):
    Qwen2.5-VL 7B 4-bit: ~8초/req, 100건 = ~13분, 1k = ~2h
    Qwen2.5-VL 32B 4-bit: ~25초/req, 100건 = ~40분, 1k = ~7h
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock
from typing import Optional

import httpx
from PIL import Image

# .env.local 자동 로드
ENV_PATH = Path(__file__).parent.parent.parent.parent / ".env.local"
if ENV_PATH.exists():
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            value = value.strip().strip('"').strip("'")
            if key.strip() and key.strip() not in os.environ:
                os.environ[key.strip()] = value

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
DEFAULT_MODEL = "qwen2.5vl:7b"
MAX_TOKENS = 700
TEMPERATURE = 0.0
PAI_VERSION = os.environ.get("PAI_VERSION", "v1")

RESIZE_MAX = 512
JPEG_QUALITY = 85
DOWNLOAD_TIMEOUT = 20
INVOKE_TIMEOUT = 120  # Ollama 가 Bedrock 보다 느림 — timeout 늘림
FETCH_PAGE = 500


def load_prompts() -> tuple[str, str]:
    """prompt.txt 에서 SYSTEM / USER prompt 추출."""
    pt = Path(__file__).parent / "prompt.txt"
    text = pt.read_text(encoding="utf-8")
    sys_marker = "SYSTEM PROMPT (Claude messages.system):"
    user_marker = "USER PROMPT (sent with image):"
    sys_start = text.index(sys_marker) + len(sys_marker)
    user_start = text.index(user_marker)
    sys_section = text[sys_start:user_start]
    user_section = text[user_start + len(user_marker) :]
    sys_clean = "\n".join(
        line for line in sys_section.splitlines() if not line.startswith("===")
    ).strip()
    user_clean = "\n".join(
        line for line in user_section.splitlines() if not line.startswith("===")
    ).strip()
    return sys_clean, user_clean


class PostgRESTClient:
    """PostgREST shim 에 직접 HTTP 호출."""

    def __init__(self, base_url: str, token: str) -> None:
        self.base = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        self.http = httpx.Client(timeout=30, headers=self.headers)

    def select(self, table: str, params: dict) -> list[dict]:
        resp = self.http.get(f"{self.base}/{table}", params=params)
        resp.raise_for_status()
        return resp.json()

    def upsert(self, table: str, row: dict, on_conflict: str) -> None:
        url = f"{self.base}/{table}?on_conflict={on_conflict}"
        headers = {
            **self.headers,
            "Prefer": "resolution=merge-duplicates,return=minimal",
        }
        resp = self.http.post(url, json=row, headers=headers)
        resp.raise_for_status()

    def close(self) -> None:
        self.http.close()


def download_b64(http: httpx.Client, url: str) -> Optional[str]:
    """이미지 다운로드 + 512×512 jpg q85 + base64."""
    try:
        r = http.get(url)
        r.raise_for_status()
        if len(r.content) > 10 * 1024 * 1024:
            return None
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        img.thumbnail((RESIZE_MAX, RESIZE_MAX), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except (httpx.HTTPError, OSError, ValueError):
        return None


def parse_pai_text(text: str) -> Optional[dict]:
    """``` fence 제거 + JSON parse."""
    t = text.strip()
    if t.startswith("```"):
        lines = t.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines)
    try:
        obj = json.loads(t)
        return obj if isinstance(obj, dict) else None
    except (json.JSONDecodeError, ValueError):
        return None


def validate_pai(obj: dict) -> bool:
    """필수 필드 검증. non-fashion 도 valid → INSERT 함 (재시도 방지)."""
    if obj.get("error") in ("non-fashion image", "non-garment image"):
        return True
    required = ["category", "fabric", "color_family", "pattern", "season"]
    if not all(k in obj and obj[k] for k in required):
        return False
    cat = obj.get("category")
    if cat == "clothing" and not obj.get("fit"):
        return False
    return True


def _coerce_na(val):
    """'n/a' / ':n/a' / 빈 문자열 → None. enum 필터 호환."""
    if val is None:
        return None
    if isinstance(val, str):
        v = val.strip().lstrip(":").strip().lower()
        if v in ("n/a", "na", "none", "null", ""):
            return None
    return val


def _coerce_float(val) -> Optional[float]:
    """confidence 같은 numeric 컬럼 — 문자열 'n/a' / ':0.85' 등도 안전 처리."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        s = val.strip().lstrip(":").strip()
        try:
            return float(s)
        except (ValueError, TypeError):
            return None
    return None


def build_pai_row(
    product_id: str, parsed: dict, raw_text: str, prompt_hash: str, model_id: str
) -> dict:
    """PAI row 빌드. 'n/a' (해당없음) → NULL. non-fashion 도 sentinel row INSERT."""
    if parsed.get("error") in ("non-fashion image", "non-garment image"):
        return {
            "product_id": product_id,
            "version": PAI_VERSION,
            "model_id": model_id,
            "prompt_hash": prompt_hash,
            "category": "non-fashion",
            "confidence": _coerce_float(parsed.get("confidence")) or 0.0,
            "error": parsed.get("error"),
            "raw_response": {"text": raw_text, "parsed": parsed},
        }
    return {
        "product_id": product_id,
        "version": PAI_VERSION,
        "model_id": model_id,
        "prompt_hash": prompt_hash,
        "category": parsed.get("category") or "Unknown",
        "subcategory": parsed.get("subcategory"),
        "fit": _coerce_na(parsed.get("fit")),
        "fabric": parsed.get("fabric"),
        "color_family": parsed.get("color_family"),
        "color_detail": parsed.get("color_detail"),
        "pattern": parsed.get("pattern"),
        "season": parsed.get("season"),
        "style_node": parsed.get("style_node"),
        "mood_tags": parsed.get("mood_tags") or [],
        "keywords_ko": parsed.get("keywords_ko") or [],
        "keywords_en": parsed.get("keywords_en") or [],
        "confidence": _coerce_float(parsed.get("confidence")),
        "neckline": _coerce_na(parsed.get("neckline")),
        "sleeve": _coerce_na(parsed.get("sleeve")),
        "length": _coerce_na(parsed.get("length")),
        "closure": _coerce_na(parsed.get("closure")),
        "texture": _coerce_na(parsed.get("texture")),
        "decoration": _coerce_na(parsed.get("decoration")),
        "silhouette": _coerce_na(parsed.get("silhouette")),
        "formality": parsed.get("formality"),
        "raw_response": {"text": raw_text, "parsed": parsed},
    }


class Stats:
    def __init__(self) -> None:
        self.lock = Lock()
        self.success = 0
        self.dl_fail = 0
        self.invoke_fail = 0
        self.parse_fail = 0
        self.schema_fail = 0
        self.upsert_fail = 0

    def incr(self, key: str) -> None:
        with self.lock:
            setattr(self, key, getattr(self, key) + 1)

    def total(self) -> int:
        return (
            self.success
            + self.dl_fail
            + self.invoke_fail
            + self.parse_fail
            + self.schema_fail
            + self.upsert_fail
        )


def ollama_invoke(
    http: httpx.Client, model: str, system_prompt: str, user_prompt: str, b64: str
) -> Optional[str]:
    """Ollama /api/chat 호출 — JSON-mode 강제. 응답 text 반환."""
    try:
        resp = http.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt, "images": [b64]},
                ],
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": TEMPERATURE,
                    "num_predict": MAX_TOKENS,
                },
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content")
    except (httpx.HTTPError, json.JSONDecodeError):
        return None


def process_one(
    pid: str,
    image_url: str,
    name: str,
    http: httpx.Client,
    pg: PostgRESTClient,
    model: str,
    system_prompt: str,
    user_prompt: str,
    prompt_hash: str,
    stats: Stats,
    failed_log: list[dict],
    failed_lock: Lock,
    dry_run: bool,
) -> None:
    sid = pid[:8]
    name_short = (name or "")[:42]
    print(f"  🔍 [{sid}] {name_short}", flush=True)

    b64 = download_b64(http, image_url)
    if not b64:
        print(f"  ❌ [{sid}] download failed", flush=True)
        stats.incr("dl_fail")
        with failed_lock:
            failed_log.append({"product_id": pid, "stage": "download", "url": image_url})
        return

    if dry_run:
        print(f"  ✅ [{sid}] dry-run OK", flush=True)
        stats.incr("success")
        return

    text = ollama_invoke(http, model, system_prompt, user_prompt, b64)
    if text is None:
        print(f"  ❌ [{sid}] Ollama invoke failed", flush=True)
        stats.incr("invoke_fail")
        with failed_lock:
            failed_log.append({"product_id": pid, "stage": "invoke"})
        return

    parsed = parse_pai_text(text)
    if not parsed:
        print(f"  ❌ [{sid}] JSON parse failed | {text[:50]}", flush=True)
        stats.incr("parse_fail")
        with failed_lock:
            failed_log.append({"product_id": pid, "stage": "parse_json", "text_preview": text[:200]})
        return

    if not validate_pai(parsed):
        print(f"  ⚠️  [{sid}] schema fail | missing required fields", flush=True)
        stats.incr("schema_fail")
        with failed_lock:
            failed_log.append({"product_id": pid, "stage": "schema", "parsed": parsed})
        return

    row = build_pai_row(pid, parsed, text, prompt_hash, model)
    try:
        pg.upsert("product_ai_analysis", row, on_conflict="product_id,version")
        stats.incr("success")
        cat = row.get("category")
        if cat == "non-fashion":
            print(f"  📦 [{sid}] non-fashion · skip search (sentinel row)", flush=True)
        else:
            sub = row.get("subcategory") or "—"
            sn = row.get("style_node") or "—"
            color = row.get("color_family") or "—"
            fmt = row.get("formality") or "—"
            silh = row.get("silhouette") or "—"
            print(
                f"  ✅ [{sid}] {cat}/{sub} · 🎨 {color} · 🌳 {sn} · 👔 {fmt} · 📐 {silh}",
                flush=True,
            )
    except httpx.HTTPError as e:
        print(f"  ❌ [{sid}] PostgREST upsert failed: {type(e).__name__}", flush=True)
        stats.incr("upsert_fail")
        with failed_lock:
            failed_log.append(
                {"product_id": pid, "stage": "upsert", "error": f"{type(e).__name__}: {e}"}
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="Ollama 로컬 — PAI 백필")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true", help="invoke 안 함")
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="병렬도. Mac GPU 단일이라 1 권장. 2 도 가능하지만 throughput 안 늘 수 있음",
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL, help="Ollama 모델 ID (qwen2.5vl:7b/32b 등)"
    )
    args = parser.parse_args()

    db_url = os.environ.get("DB_URL")
    db_token = os.environ.get("DB_TOKEN")
    if not all([db_url, db_token]):
        print("[fatal] env 누락 — DB_URL / DB_TOKEN", file=sys.stderr)
        return 2

    # Ollama 서버 sanity check
    try:
        r = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
        if args.model not in models and args.model.split(":")[0] not in [
            m.split(":")[0] for m in models
        ]:
            print(
                f"[fatal] Ollama 에 '{args.model}' 없음. 다운로드: ollama pull {args.model}",
                file=sys.stderr,
            )
            print(f"[fatal] 보유 모델: {models}", file=sys.stderr)
            return 2
    except httpx.HTTPError as e:
        print(
            f"[fatal] Ollama 서버 연결 실패 ({OLLAMA_URL}): {e}. 'ollama serve' 실행?",
            file=sys.stderr,
        )
        return 2

    pg = PostgRESTClient(db_url, db_token)
    system_prompt, user_prompt = load_prompts()
    prompt_hash = hashlib.sha256(
        (system_prompt + "\n---\n" + user_prompt).encode("utf-8")
    ).hexdigest()[:16]
    print(f"[init] model={args.model} workers={args.workers} dry_run={args.dry_run}")
    print(f"[init] PAI_VERSION={PAI_VERSION} db={db_url} ollama={OLLAMA_URL}")
    print(
        f"[init] system_prompt={len(system_prompt)} chars / "
        f"user_prompt={len(user_prompt)} chars / prompt_hash={prompt_hash}"
    )

    print("[fetch] PAI 기보유 set")
    pai_existing: set[str] = set()
    offset = 0
    while True:
        rows = pg.select(
            "product_ai_analysis",
            {
                "select": "product_id",
                "version": f"eq.{PAI_VERSION}",
                "limit": str(FETCH_PAGE),
                "offset": str(offset),
            },
        )
        if not rows:
            break
        pai_existing.update(r["product_id"] for r in rows)
        if len(rows) < FETCH_PAGE:
            break
        offset += FETCH_PAGE
    print(f"[fetch] PAI 기보유: {len(pai_existing)}")

    print("[fetch] 대상 product")
    jobs: list[tuple[str, str, str]] = []
    offset = 0
    while True:
        if args.limit is not None and len(jobs) >= args.limit:
            break
        rows = pg.select(
            "products",
            {
                "select": "id,images,name",
                "in_stock": "eq.true",
                "images": "not.is.null",
                "limit": str(FETCH_PAGE),
                "offset": str(offset),
            },
        )
        if not rows:
            break
        for row in rows:
            if row["id"] in pai_existing:
                continue
            imgs = row.get("images") or []
            if not imgs or not imgs[0]:
                continue
            jobs.append((row["id"], imgs[0], row.get("name") or ""))
            if args.limit is not None and len(jobs) >= args.limit:
                break
        if len(rows) < FETCH_PAGE:
            break
        offset += FETCH_PAGE
    print(f"[fetch] 대상: {len(jobs)}")

    if not jobs:
        print("[done] no products to process")
        pg.close()
        return 0

    stats = Stats()
    failed_log: list[dict] = []
    failed_lock = Lock()
    t0 = time.time()

    with httpx.Client(timeout=INVOKE_TIMEOUT, follow_redirects=True) as http:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futs = [
                pool.submit(
                    process_one,
                    pid,
                    url,
                    name,
                    http,
                    pg,
                    args.model,
                    system_prompt,
                    user_prompt,
                    prompt_hash,
                    stats,
                    failed_log,
                    failed_lock,
                    args.dry_run,
                )
                for pid, url, name in jobs
            ]
            for i, f in enumerate(as_completed(futs), 1):
                _ = f.result()
                if i % 25 == 0:
                    el = time.time() - t0
                    rate = i / el if el > 0 else 0
                    eta_min = (len(jobs) - i) / rate / 60 if rate > 0 else 0
                    fails = stats.dl_fail + stats.invoke_fail + stats.parse_fail + stats.upsert_fail
                    print(
                        f"\n📊 [{i}/{len(jobs)}] · ⚡ {rate:.2f} req/s · ⏱  ETA {eta_min:.1f}분  "
                        f"│ ✅ {stats.success}  📦 sentinel(merged in ✅)  ⚠️ {stats.schema_fail}  ❌ {fails}\n",
                        flush=True,
                    )

    elapsed = time.time() - t0
    print("=" * 60)
    print(f"[end] total={stats.total()} success={stats.success}")
    print(
        f"      dl_fail={stats.dl_fail} invoke_fail={stats.invoke_fail} "
        f"parse_fail={stats.parse_fail} schema_fail={stats.schema_fail} "
        f"upsert_fail={stats.upsert_fail}"
    )
    print(f"      elapsed={elapsed:.1f}s rate={stats.total() / elapsed:.2f}/s")
    print(
        f"      success rate={stats.success / max(stats.total(), 1) * 100:.1f}%"
    )

    if failed_log:
        ff = Path("/tmp/pai-local-failed.jsonl")
        with open(ff, "w", encoding="utf-8") as f:
            for fr in failed_log:
                f.write(json.dumps(fr, ensure_ascii=False) + "\n")
        print(f"[note] {len(failed_log)} failed records → {ff}")

    pg.close()

    if stats.success / max(stats.total(), 1) < 0.95:
        print(
            "[warn] success rate < 95% — 재실행 또는 worker 조정 권장",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
