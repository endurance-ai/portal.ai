"""brand_nodes.attributes 백필 — /api/internal/extract-brand-attributes 일괄 호출.

대상 (default): products WHERE is_brand_representative=true 보유한 모든 brand (~2,245).

흐름:
  1. DB 에서 대상 brand_id 목록 수집 (대표상품 ≥1장 보유)
     --only-empty (default): attributes 가 비어있거나 키 < 10 개
     --force-all          : 전부 (이미 채워진 brand 도 덮어쓰기)
  2. ThreadPoolExecutor (workers=10) 로 endpoint 동시 호출
  3. 진행률 + 최종 통계 출력

사용:
  cd /Users/hansangho/Desktop/kikoai/app
  uv run --with httpx --with python-dotenv python scripts/backfill_brand_attributes.py --limit 5 --dry-run
  uv run --with httpx --with python-dotenv python scripts/backfill_brand_attributes.py --limit 5    # 5건 실제 호출
  uv run --with httpx --with python-dotenv python scripts/backfill_brand_attributes.py              # 풀배치 (only-empty)
  uv run --with httpx --with python-dotenv python scripts/backfill_brand_attributes.py --force-all  # 풀배치 (덮어쓰기)

엔드포인트:
  - 로컬: NEXT_PUBLIC_APP_URL or http://localhost:3400 (default)
  - 원격: --base-url https://... 지정
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ATTRIBUTE_KEY_THRESHOLD = 10  # >= 10 키 보유 시 "채워짐"으로 간주 (v1 출력 13키 중 90%)


def load_env_local(root: Path) -> dict[str, str]:
    env_path = root / ".env.local"
    if not env_path.exists():
        return {}
    out: dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def fetch_target_brand_ids(
    db_url: str, db_token: str, only_empty: bool, limit: int | None
) -> list[int]:
    """대상 brand_id 목록 — 대표상품 ≥1장 보유 ∩ (only_empty 면 attributes 부족)."""
    import httpx

    with httpx.Client(timeout=60, headers={"Authorization": f"Bearer {db_token}"}) as c:
        # 1) 대표상품 보유 brand_id (distinct)
        reps = c.get(
            f"{db_url}/products",
            params={
                "select": "brand_node_id",
                "is_brand_representative": "eq.true",
                "brand_node_id": "not.is.null",
            },
        )
        reps.raise_for_status()
        rep_ids = sorted({r["brand_node_id"] for r in reps.json()})

        if not only_empty:
            return rep_ids[:limit] if limit else rep_ids

        # 2) attributes 부족한 brand 만 필터
        bn = c.get(
            f"{db_url}/brand_nodes",
            params={"select": "id,attributes"},
        )
        bn.raise_for_status()
        attr_by_id = {r["id"]: (r["attributes"] or {}) for r in bn.json()}

        targets = [
            bid for bid in rep_ids
            if len(attr_by_id.get(bid, {})) < ATTRIBUTE_KEY_THRESHOLD
        ]
        return targets[:limit] if limit else targets


def call_endpoint(
    base_url: str, internal_key: str, brand_id: int, force: bool, timeout: float,
    max_retries: int = 4,
) -> dict:
    """endpoint 호출 + 5xx/llm_failed 자동 재시도 (exponential backoff: 2s, 4s, 8s, 16s).

    LiteLLM proxy / Bedrock nova-lite 동시 호출 한도 초과 시 5xx 폭주.
    재시도 사이 backoff 으로 throttle.
    """
    import httpx
    import random

    last_body: dict = {"_status": 0, "ok": False, "error": "no attempts"}
    for attempt in range(max_retries):
        try:
            r = httpx.post(
                f"{base_url}/api/internal/extract-brand-attributes",
                json={"brand_id": brand_id, "force": force},
                headers={"X-Internal-Key": internal_key, "Content-Type": "application/json"},
                timeout=timeout,
            )
            try:
                body = r.json()
            except Exception:
                body = {"raw": r.text[:300]}
            body["_status"] = r.status_code
            last_body = body

            # 성공 또는 영구 실패 (4xx, insufficient_images, 파싱 실패 등) → 즉시 반환
            ok = body.get("ok", False)
            if ok:
                if attempt > 0:
                    body["_retries"] = attempt
                return body
            result = body.get("result")
            if r.status_code < 500 and result not in {"llm_failed"}:
                # 4xx 또는 일시적 아닌 5xx (json_parse 등) → 재시도 무의미
                return body
        except Exception as exc:  # noqa: BLE001
            last_body = {"_status": 0, "ok": False, "error": f"http_exception: {exc}"}

        # backoff: 2, 4, 8, 16s + jitter
        if attempt < max_retries - 1:
            sleep_s = (2 ** (attempt + 1)) + random.uniform(0, 1.5)
            time.sleep(sleep_s)

    last_body["_retries"] = max_retries
    return last_body


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--limit", type=int, default=None, help="대상 brand 수 제한")
    p.add_argument("--dry-run", action="store_true", help="대상 목록만 출력하고 종료")
    p.add_argument(
        "--force-all",
        action="store_true",
        help="이미 채워진 brand 도 덮어쓰기 (default: only-empty)",
    )
    p.add_argument(
        "--workers", type=int, default=10, help="동시 endpoint 호출 수 (default 10)"
    )
    p.add_argument(
        "--timeout", type=float, default=120.0, help="endpoint 호출당 timeout 초 (default 120)"
    )
    p.add_argument(
        "--base-url",
        default=None,
        help="endpoint base URL (default: http://localhost:3400 또는 NEXT_PUBLIC_APP_URL)",
    )
    args = p.parse_args()

    root = Path(__file__).resolve().parent.parent
    env = load_env_local(root)
    db_url = env.get("DB_URL") or os.environ.get("DB_URL")
    db_token = env.get("DB_TOKEN") or os.environ.get("DB_TOKEN")
    internal_key = env.get("INTERNAL_API_KEY") or os.environ.get("INTERNAL_API_KEY")
    base_url = (
        args.base_url
        or env.get("NEXT_PUBLIC_APP_URL")
        or os.environ.get("NEXT_PUBLIC_APP_URL")
        or "http://localhost:3400"
    )

    if not db_url or not db_token:
        print("[fatal] DB_URL / DB_TOKEN 미설정 (.env.local)", file=sys.stderr)
        return 2
    if not internal_key:
        print("[fatal] INTERNAL_API_KEY 미설정 (.env.local)", file=sys.stderr)
        return 2

    only_empty = not args.force_all
    print(f"[1/3] 대상 brand_id 수집 (only_empty={only_empty})...")
    target_ids = fetch_target_brand_ids(db_url, db_token, only_empty, args.limit)
    print(f"     {len(target_ids)} brand")
    if not target_ids:
        print("[done] 대상 없음")
        return 0

    if args.dry_run:
        print(f"[dry] base_url={base_url}")
        print(f"[dry] 처음 10건: {target_ids[:10]}")
        print(f"[dry] 동시 workers={args.workers}, timeout={args.timeout}s")
        return 0

    print(f"[2/3] endpoint 호출 시작 — {base_url}")
    print(f"     workers={args.workers}, timeout={args.timeout}s, force={args.force_all}")
    t0 = time.time()
    counts = Counter()
    failures: list[tuple[int, str]] = []

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(
                call_endpoint, base_url, internal_key, bid, args.force_all, args.timeout
            ): bid
            for bid in target_ids
        }
        done = 0
        for f in as_completed(futures):
            bid = futures[f]
            res = f.result()
            done += 1
            status = res.get("_status")
            ok = res.get("ok", False)
            result = res.get("result", "unknown")
            label = result if ok else f"FAIL({status})"
            counts[label] += 1
            if not ok:
                failures.append((bid, res.get("error", "?")[:120]))
            if done % 25 == 0 or done == len(target_ids):
                elapsed = time.time() - t0
                rate = done / max(elapsed, 1e-6)
                eta = (len(target_ids) - done) / max(rate, 1e-6)
                print(
                    f"     {done}/{len(target_ids)} "
                    f"({rate:.1f}/s, ETA {eta:.0f}s) — {dict(counts)}"
                )

    elapsed = time.time() - t0
    print(f"\n[3/3] 완료 elapsed={elapsed:.1f}s")
    print(f"     결과 분포: {dict(counts)}")
    if failures:
        print(f"     실패 {len(failures)}건 (첫 10):")
        for bid, err in failures[:10]:
            print(f"       brand_id={bid}: {err}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
