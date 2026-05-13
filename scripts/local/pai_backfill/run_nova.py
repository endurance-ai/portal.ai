"""
PAI Backfill — Bedrock Nova Lite (us-east-1 cross-region inference profile).

# @MX:NOTE: run_local.py 의 emoji-rich 로깅 그대로 + Bedrock Nova native schema.
# @MX:REASON: Haiku 4.5 sync 는 RPM=50 binding 으로 80k=27h. Nova Lite us.* profile RPM=400 → 80k=3.3h, $26.
# @MX:NOTE: Bedrock batch 권한 여전히 막힘 (2026-05-13 확인). sync InvokeModel 로 우회.

사용:
    python scripts/local/pai_backfill/run_nova.py --limit 100             # 100건 smoke
    python scripts/local/pai_backfill/run_nova.py --workers 6             # 풀배치
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

import boto3
import httpx
from PIL import Image

ENV_PATH = Path(__file__).parent.parent.parent.parent / ".env.local"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        if k.strip() and k.strip() not in os.environ:
            os.environ[k.strip()] = v

MODEL_ID = "us.amazon.nova-lite-v1:0"  # 고정 — env override 안 받음
MAX_TOKENS = 700
TEMPERATURE = 0.0
PAI_VERSION = os.environ.get("PAI_VERSION", "v1")

RESIZE_MAX = 512
JPEG_QUALITY = 85
DOWNLOAD_TIMEOUT = 20
INVOKE_TIMEOUT = 60
FETCH_PAGE = 500


def load_prompts() -> tuple[str, str]:
    pt = Path(__file__).parent / "prompt.txt"
    text = pt.read_text(encoding="utf-8")
    sys_start = text.index("SYSTEM PROMPT (Claude messages.system):") + len(
        "SYSTEM PROMPT (Claude messages.system):"
    )
    user_start = text.index("USER PROMPT (sent with image):")
    sys_section = text[sys_start:user_start]
    user_section = text[user_start + len("USER PROMPT (sent with image):") :]
    sys_clean = "\n".join(
        l for l in sys_section.splitlines() if not l.startswith("===")
    ).strip()
    user_clean = "\n".join(
        l for l in user_section.splitlines() if not l.startswith("===")
    ).strip()
    return sys_clean, user_clean


class PostgRESTClient:
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
    if val is None:
        return None
    if isinstance(val, str):
        v = val.strip().lstrip(":").strip().lower()
        if v in ("n/a", "na", "none", "null", ""):
            return None
    return val


def _coerce_float(val) -> Optional[float]:
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
        self.throttle = 0

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


def nova_invoke(
    bedrock, system_prompt: str, user_prompt: str, b64: str
) -> tuple[Optional[str], Optional[str]]:
    """Bedrock Nova invoke_model. Native schema: schemaVersion=messages-v1.

    Returns: (text, err_msg). text==None 이면 err_msg 에 사유.
    """
    body = {
        "schemaVersion": "messages-v1",
        "system": [{"text": system_prompt}],
        "messages": [
            {
                "role": "user",
                "content": [
                    {"image": {"format": "jpeg", "source": {"bytes": b64}}},
                    {"text": user_prompt},
                ],
            }
        ],
        "inferenceConfig": {"max_new_tokens": MAX_TOKENS, "temperature": TEMPERATURE},
    }
    try:
        resp = bedrock.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps(body),
            contentType="application/json",
        )
        payload = json.loads(resp["body"].read())
        return payload["output"]["message"]["content"][0]["text"], None
    except Exception as e:  # noqa: BLE001 — boto3 error spectrum 광범위
        return None, f"{type(e).__name__}: {str(e)[:160]}"


def process_one(
    pid: str,
    image_url: str,
    name: str,
    http: httpx.Client,
    bedrock,
    pg: PostgRESTClient,
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

    # Nova invoke with throttle retry
    text = None
    last_err = None
    for attempt in range(3):
        text, last_err = nova_invoke(bedrock, system_prompt, user_prompt, b64)
        if text is not None:
            break
        is_throttle = last_err and ("Throttl" in last_err or "TooManyRequests" in last_err)
        if is_throttle:
            stats.incr("throttle")
        time.sleep(2 ** attempt)
    if text is None:
        print(f"  ❌ [{sid}] Bedrock invoke failed | {last_err}", flush=True)
        stats.incr("invoke_fail")
        with failed_lock:
            failed_log.append({"product_id": pid, "stage": "invoke", "error": last_err})
        return

    parsed = parse_pai_text(text)
    if not parsed:
        print(f"  ❌ [{sid}] JSON parse failed | {text[:60]}", flush=True)
        stats.incr("parse_fail")
        with failed_lock:
            failed_log.append(
                {"product_id": pid, "stage": "parse_json", "text_preview": text[:200]}
            )
        return

    if not validate_pai(parsed):
        print(f"  ⚠️  [{sid}] schema fail | missing required fields", flush=True)
        stats.incr("schema_fail")
        with failed_lock:
            failed_log.append({"product_id": pid, "stage": "schema", "parsed": parsed})
        return

    row = build_pai_row(pid, parsed, text, prompt_hash, MODEL_ID)
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
    parser = argparse.ArgumentParser(description="Bedrock Nova Lite — PAI 백필")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--workers",
        type=int,
        default=6,
        help="병렬도. Nova Lite us.* RPM=400. workers 6-8 권장 (안전 마진).",
    )
    parser.add_argument(
        "--skip-haiku",
        action="store_true",
        help="기존 Haiku 4.5 PAI 가 있는 product 는 건너뜀 (default: skip).",
    )
    parser.add_argument(
        "--overwrite-qwen",
        action="store_true",
        default=True,
        help="기존 Qwen 7B PAI 는 덮어씀 (default: True).",
    )
    args = parser.parse_args()

    db_url = os.environ.get("DB_URL")
    db_token = os.environ.get("DB_TOKEN")
    profile = os.environ.get("AWS_PROFILE", "kiko.ai")
    region = os.environ.get("AWS_REGION", "us-east-1")
    if not all([db_url, db_token]):
        print("[fatal] env 누락 — DB_URL / DB_TOKEN", file=sys.stderr)
        return 2

    pg = PostgRESTClient(db_url, db_token)
    session = boto3.Session(profile_name=profile, region_name=region)
    bedrock = session.client(
        "bedrock-runtime",
        config=boto3.session.Config(read_timeout=INVOKE_TIMEOUT, retries={"max_attempts": 0}),
    )

    system_prompt, user_prompt = load_prompts()
    prompt_hash = hashlib.sha256(
        (system_prompt + "\n---\n" + user_prompt).encode("utf-8")
    ).hexdigest()[:16]
    print(f"[init] model={MODEL_ID} workers={args.workers} dry_run={args.dry_run}")
    print(f"[init] PAI_VERSION={PAI_VERSION} db={db_url} region={region} profile={profile}")
    print(
        f"[init] system_prompt={len(system_prompt)} chars / "
        f"user_prompt={len(user_prompt)} chars / prompt_hash={prompt_hash}"
    )

    # 기존 PAI 중 Haiku 행만 skip set 으로 잡음 (Qwen 은 덮어쓰기).
    print("[fetch] 기존 PAI (Haiku 행만 skip, Qwen 행은 덮어씀)")
    haiku_set: set[str] = set()
    offset = 0
    while True:
        rows = pg.select(
            "product_ai_analysis",
            {
                "select": "product_id,model_id",
                "version": f"eq.{PAI_VERSION}",
                "limit": str(FETCH_PAGE),
                "offset": str(offset),
            },
        )
        if not rows:
            break
        for r in rows:
            if r.get("model_id", "").startswith("us.anthropic.claude-haiku"):
                haiku_set.add(r["product_id"])
        if len(rows) < FETCH_PAGE:
            break
        offset += FETCH_PAGE
    print(f"[fetch] Haiku 기보유 (skip 대상): {len(haiku_set)}")

    print("[fetch] 대상 product 수집")
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
            if row["id"] in haiku_set:
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
                    bedrock,
                    pg,
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
                if i % 50 == 0:
                    el = time.time() - t0
                    rate = i / el if el > 0 else 0
                    eta_min = (len(jobs) - i) / rate / 60 if rate > 0 else 0
                    fails = (
                        stats.dl_fail
                        + stats.invoke_fail
                        + stats.parse_fail
                        + stats.upsert_fail
                    )
                    print(
                        f"\n📊 [{i}/{len(jobs)}] · ⚡ {rate:.2f} req/s · ⏱  ETA {eta_min:.1f}분  "
                        f"│ ✅ {stats.success}  📦 sentinel(merged in ✅)  ⚠️ {stats.schema_fail}  "
                        f"❌ {fails}  🔁 throttle={stats.throttle}\n",
                        flush=True,
                    )

    elapsed = time.time() - t0
    print("=" * 60)
    print(f"[end] total={stats.total()} success={stats.success}")
    print(
        f"      dl_fail={stats.dl_fail} invoke_fail={stats.invoke_fail} "
        f"parse_fail={stats.parse_fail} schema_fail={stats.schema_fail} "
        f"upsert_fail={stats.upsert_fail} throttle={stats.throttle}"
    )
    print(f"      elapsed={elapsed:.1f}s rate={stats.total() / elapsed:.2f}/s")
    print(
        f"      success rate={stats.success / max(stats.total(), 1) * 100:.1f}%"
    )

    if failed_log:
        ff = Path("/tmp/pai-nova-failed.jsonl")
        with open(ff, "w", encoding="utf-8") as f:
            for fr in failed_log:
                f.write(json.dumps(fr, ensure_ascii=False) + "\n")
        print(f"[note] {len(failed_log)} failed records → {ff}")

    pg.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
