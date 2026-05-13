"""
PAI Backfill — Bedrock sync InvokeModel (self-host PG / PostgREST 기반).

# @MX:NOTE: feature/data-debt-foundation 의 T2.5b 스크립트를 PostgREST 로 포팅. v6 핵심 입력 PAI 가 0 rows 상태라 백필 시작점.
# @MX:NOTE: Bedrock batch 권한 미승인 상태 (account-level gating) — Support 응답 대기 동안 sync 우회.
# @MX:REASON: 1k 테스트 통과 후 80k 풀배치 진행. RPM quota=50 이 binding (workers 늘려도 의미 없음).

용법:
    python scripts/local/pai_backfill/run_sync.py --limit 10  --dry-run    # body build 까지만
    python scripts/local/pai_backfill/run_sync.py --limit 100             # smoke test
    python scripts/local/pai_backfill/run_sync.py --limit 1000            # 1k 검증
    python scripts/local/pai_backfill/run_sync.py --workers 4             # 풀배치 (RPM=50 이라 4-8 면 충분)

비용 / 시간 (Haiku 4.5 sync, RPM=50):
    1k   = ~20 분, ~$5.5
    80k  = ~27 시간, ~$440
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

MODEL_ID = os.environ.get(
    "AWS_BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
)
ANTHROPIC_VERSION = "bedrock-2023-05-31"
MAX_TOKENS = 500
TEMPERATURE = 0.0
PAI_VERSION = os.environ.get("PAI_VERSION", "v1")

RESIZE_MAX = 512
JPEG_QUALITY = 85
DOWNLOAD_TIMEOUT = 20
INVOKE_TIMEOUT = 60
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
    """PostgREST shim 에 직접 HTTP 호출.

    # @MX:NOTE: supabase python client 대체 — 자체호스트 PostgREST 직접 사용.
    """

    def __init__(self, base_url: str, token: str) -> None:
        self.base = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        self.http = httpx.Client(timeout=30, headers=self.headers)

    def select(self, table: str, params: dict) -> list[dict]:
        """GET /{table}?{params} — PostgREST select."""
        resp = self.http.get(f"{self.base}/{table}", params=params)
        resp.raise_for_status()
        return resp.json()

    def upsert(self, table: str, row: dict, on_conflict: str) -> None:
        """POST /{table} with Prefer: resolution=merge-duplicates."""
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
    """필수 필드 검증.

    # @MX:NOTE: non-fashion 도 valid → INSERT 함 (재시도 방지). build_pai_row 가 sentinel row 빌드.
    """
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
    """'n/a' → None 변환. 검색 enum filter 호환."""
    return None if val == "n/a" else val


def build_pai_row(product_id: str, parsed: dict, raw_text: str, prompt_hash: str) -> dict:
    """PAI row 빌드. 'n/a' (해당없음) → NULL.

    # @MX:NOTE: v6 axis 8개 (neckline ~ formality) — migration 045 후 named column 으로
    #           매핑. raw_response.parsed 에도 그대로 박힘 (audit 용).
    # @MX:NOTE: non-fashion 케이스 (책 / 유리잔 / 향수 / 인형 등) → sentinel category='non-fashion'
    #           + error 컬럼 박음. 검색 INNER JOIN 에서 자연스럽게 빠짐 + 재시도 방지.
    """
    # non-fashion 분기 — 최소 row + error sentinel
    if parsed.get("error") in ("non-fashion image", "non-garment image"):
        return {
            "product_id": product_id,
            "version": PAI_VERSION,
            "model_id": MODEL_ID,
            "prompt_hash": prompt_hash,
            "category": "non-fashion",
            "confidence": parsed.get("confidence") or 0.0,
            "error": parsed.get("error"),
            "raw_response": {"text": raw_text, "parsed": parsed},
        }
    return {
        "product_id": product_id,
        "version": PAI_VERSION,
        "model_id": MODEL_ID,
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
        "confidence": parsed.get("confidence"),
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


def process_one(
    pid: str,
    image_url: str,
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
    """단일 product 처리: download → resize → b64 → invoke_model → parse → UPSERT."""
    b64 = download_b64(http, image_url)
    if not b64:
        stats.incr("dl_fail")
        with failed_lock:
            failed_log.append(
                {"product_id": pid, "stage": "download", "url": image_url}
            )
        return

    body = {
        "anthropic_version": ANTHROPIC_VERSION,
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": user_prompt},
                ],
            }
        ],
    }

    if dry_run:
        stats.incr("success")
        return

    try:
        resp = bedrock.invoke_model(modelId=MODEL_ID, body=json.dumps(body))
        data = json.loads(resp["body"].read())
    except Exception as e:  # noqa: BLE001 — boto3 error spectrum 광범위
        stats.incr("invoke_fail")
        with failed_lock:
            failed_log.append(
                {
                    "product_id": pid,
                    "stage": "invoke",
                    "error": f"{type(e).__name__}: {e}",
                }
            )
        return

    content = data.get("content") or []
    if not content or content[0].get("type") != "text":
        stats.incr("parse_fail")
        with failed_lock:
            failed_log.append({"product_id": pid, "stage": "parse_no_text", "raw": data})
        return

    text = content[0]["text"]
    parsed = parse_pai_text(text)
    if not parsed:
        stats.incr("parse_fail")
        with failed_lock:
            failed_log.append(
                {"product_id": pid, "stage": "parse_json", "text_preview": text[:200]}
            )
        return

    if not validate_pai(parsed):
        stats.incr("schema_fail")
        with failed_lock:
            failed_log.append({"product_id": pid, "stage": "schema", "parsed": parsed})
        return

    row = build_pai_row(pid, parsed, text, prompt_hash)
    try:
        pg.upsert("product_ai_analysis", row, on_conflict="product_id,version")
        stats.incr("success")
    except httpx.HTTPError as e:
        stats.incr("upsert_fail")
        with failed_lock:
            failed_log.append(
                {
                    "product_id": pid,
                    "stage": "upsert",
                    "error": f"{type(e).__name__}: {e}",
                }
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="Bedrock sync InvokeModel — PAI 백필")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument(
        "--dry-run", action="store_true", help="invoke 안 함, body build 까지만"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="병렬도. RPM quota=50 이라 4-8 면 충분",
    )
    args = parser.parse_args()

    db_url = os.environ.get("DB_URL")
    db_token = os.environ.get("DB_TOKEN")
    profile = os.environ.get("AWS_PROFILE")
    region = os.environ.get("AWS_REGION", "us-west-2")
    if not all([db_url, db_token, profile]):
        print("[fatal] env 누락 — DB_URL / DB_TOKEN / AWS_PROFILE 확인", file=sys.stderr)
        return 2

    pg = PostgRESTClient(db_url, db_token)
    session = boto3.Session(profile_name=profile, region_name=region)
    bedrock = session.client(
        "bedrock-runtime",
        config=boto3.session.Config(read_timeout=INVOKE_TIMEOUT),
    )

    system_prompt, user_prompt = load_prompts()
    prompt_hash = hashlib.sha256(
        (system_prompt + "\n---\n" + user_prompt).encode("utf-8")
    ).hexdigest()[:16]
    print(f"[init] model={MODEL_ID} workers={args.workers} dry_run={args.dry_run}")
    print(f"[init] PAI_VERSION={PAI_VERSION} db={db_url}")
    print(
        f"[init] system_prompt={len(system_prompt)} chars / "
        f"user_prompt={len(user_prompt)} chars / prompt_hash={prompt_hash}"
    )

    # 이미 PAI 보유한 product_id set
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

    # 대상 product 수집 (in_stock=true + images not null)
    print("[fetch] 대상 product")
    jobs: list[tuple[str, str]] = []
    offset = 0
    while True:
        if args.limit is not None and len(jobs) >= args.limit:
            break
        rows = pg.select(
            "products",
            {
                "select": "id,images",
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
            jobs.append((row["id"], imgs[0]))
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

    with httpx.Client(timeout=DOWNLOAD_TIMEOUT, follow_redirects=True) as http:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futs = [
                pool.submit(
                    process_one,
                    pid,
                    url,
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
                for pid, url in jobs
            ]
            for i, f in enumerate(as_completed(futs), 1):
                _ = f.result()
                if i % 50 == 0:
                    el = time.time() - t0
                    rate = i / el if el > 0 else 0
                    print(
                        f"[run] {i}/{len(jobs)} rate={rate:.2f}/s "
                        f"success={stats.success} "
                        f"dl_fail={stats.dl_fail} invoke_fail={stats.invoke_fail} "
                        f"parse_fail={stats.parse_fail} schema_fail={stats.schema_fail} "
                        f"upsert_fail={stats.upsert_fail}"
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
        ff = Path("/tmp/pai-sync-failed.jsonl")
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
