"""brand_nodes.attributes 백필 — AWS Bedrock Converse API 직접 호출.

scripts/backfill_brand_attributes.py 의 Bedrock-direct 버전.
HTTP route (/api/internal/extract-brand-attributes) 와 LiteLLM proxy 우회.

흐름:
  1. prompts 테이블에서 active 'brand-attributes' prompt 로드
  2. 대상 brand_id 수집 (--only-empty / --force-all)
  3. ThreadPoolExecutor:
     - brand_name + 대표상품 image_url 10장 fetch (PostgREST)
     - 이미지 다운로드 (raw bytes)
     - bedrock.converse(modelId, system, messages with images)
     - JSON 파싱 + vocab sanitize
     - brand_nodes.attributes UPDATE (PostgREST)
  4. 진행률 + 통계

장점 (vs HTTP route 버전):
  - LiteLLM proxy 우회 → 5xx 폭주 없음 (Bedrock 자체 quota 가 훨씬 여유)
  - dev server 의존 0 / deploy 의존 0
  - boto3 자체 adaptive retry 내장
  - 1 hop (Python → Bedrock) vs 4 hop

사용:
  cd /Users/hansangho/Desktop/kikoai/app
  AWS_PROFILE=kiko.ai uv run --with boto3 --with httpx --with python-dotenv \\
    python scripts/backfill_brand_attributes_bedrock.py --limit 2 --dry-run
  AWS_PROFILE=kiko.ai uv run --with boto3 --with httpx --with python-dotenv \\
    python scripts/backfill_brand_attributes_bedrock.py --limit 2
  AWS_PROFILE=kiko.ai uv run --with boto3 --with httpx --with python-dotenv \\
    python scripts/backfill_brand_attributes_bedrock.py --workers 5
  AWS_PROFILE=kiko.ai uv run --with boto3 --with httpx --with python-dotenv \\
    python scripts/backfill_brand_attributes_bedrock.py --workers 5 --force-all
"""
from __future__ import annotations

import argparse
import base64  # noqa: F401  (불필요 — Converse 는 bytes 직접 받음. 참고용 import 유지)
import json
import os
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ATTRIBUTE_KEY_THRESHOLD = 10
DEFAULT_MODEL_ID = "us.amazon.nova-2-lite-v1:0"
DEFAULT_REGION = "us-east-1"

# ─── Controlled vocab (TS route 와 1:1) ─────────────────
VOCAB: dict[str, set[str]] = {
    "vibe": {
        "archival", "quiet-luxury", "minimalist-architectural", "contemporary-basic",
        "avant-garde", "deconstructed-experimental", "workwear-revival",
        "preppy-classic", "streetwear", "americana", "y2k", "balletcore", "coquette",
        "mob-wife", "indie-sleaze", "dark-academia", "cottagecore", "normcore",
        "old-money", "techwear", "gorpcore", "outdoor", "athletic", "military",
        "utilitarian", "japanese-minimalist", "japanese-avant-garde",
        "scandinavian", "parisian-chic", "british-heritage",
    },
    "palette": {
        "BLACK", "WHITE", "GREY", "NAVY", "BLUE", "BEIGE", "BROWN", "GREEN",
        "RED", "PINK", "PURPLE", "ORANGE", "YELLOW", "CREAM", "KHAKI", "MULTI",
    },
    "material": {
        "cotton", "denim", "jersey", "wool", "cashmere", "mohair", "polyester", "nylon",
        "acrylic", "silk", "satin", "leather", "suede", "knit", "fleece", "linen",
        "gore-tex", "technical-shell", "sweatshirt", "tweed",
    },
    "silhouette": {
        "oversized", "tailored", "relaxed", "slim", "cropped", "boxy",
        "body-conscious", "structured", "draped", "voluminous", "asymmetric", "layered",
    },
    "detail": {
        "raw-edge", "utility-pocket", "contrast-stitch", "oversized-logo", "monogram",
        "distressed", "patchwork", "asymmetric-cut", "drawstring", "hood",
        "zip-detail", "embroidery", "hardware", "pleated", "sheer-panel",
    },
    "pattern": {
        "solid", "stripe", "check", "graphic", "logo", "abstract", "floral", "animal", "mixed",
    },
    "gender_lean": {"mens", "womens", "unisex", "mens-leaning", "womens-leaning"},
    "formality": {"casual", "smart-casual", "business", "formal", "runway"},
    "price_tier": {"budget", "contemporary", "premium", "luxury", "hype-priced"},
    "era_reference": {"timeless", "90s", "y2k", "2010s", "2020s-now", "vintage-revival"},
    "subculture": {
        "none", "techwear", "gorpcore", "preppy", "skate", "mod", "goth",
        "hip-hop", "punk", "surf", "military",
    },
}

PICK_LIMIT: dict[str, int] = {
    "vibe": 4, "palette": 4, "material": 4,
    "silhouette": 3, "detail": 4, "pattern": 2,
}
ARRAY_FIELDS = ("vibe", "palette", "material", "silhouette", "detail", "pattern")
SINGLE_FIELDS = ("gender_lean", "formality", "price_tier", "era_reference", "subculture")


# ─── Env / DB ───────────────────────────────────────────
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


def pg_get(client, db_url: str, path: str, **params) -> list:
    r = client.get(f"{db_url}{path}", params=params)
    r.raise_for_status()
    return r.json()


def pg_patch(client, db_url: str, path: str, body: dict, **params) -> None:
    headers = {"Prefer": "return=minimal", "Content-Type": "application/json"}
    r = client.patch(f"{db_url}{path}", params=params, headers=headers, json=body)
    r.raise_for_status()


def fetch_prompt(client, db_url: str) -> dict:
    rows = pg_get(
        client, db_url, "/prompts",
        select="system_md,user_md,max_tokens,temperature,model_id",
        situation="eq.brand-attributes",
        is_active="eq.true",
        limit=1,
    )
    if not rows:
        raise RuntimeError("active prompts.situation='brand-attributes' not found")
    return rows[0]


def fetch_target_brand_ids(
    client, db_url: str, only_empty: bool, limit: int | None
) -> list[int]:
    reps = pg_get(
        client, db_url, "/products",
        select="brand_node_id",
        is_brand_representative="eq.true",
        brand_node_id="not.is.null",
    )
    rep_ids = sorted({r["brand_node_id"] for r in reps})
    if not only_empty:
        return rep_ids[:limit] if limit else rep_ids

    bn = pg_get(client, db_url, "/brand_nodes", select="id,attributes")
    attr_by_id = {r["id"]: (r["attributes"] or {}) for r in bn}
    targets = [
        bid for bid in rep_ids
        if len(attr_by_id.get(bid, {})) < ATTRIBUTE_KEY_THRESHOLD
    ]
    return targets[:limit] if limit else targets


def fetch_brand(client, db_url: str, brand_id: int) -> tuple[str, list[str]]:
    rows = pg_get(
        client, db_url, "/brand_nodes",
        select="id,brand_name", id=f"eq.{brand_id}", limit=1,
    )
    if not rows:
        raise RuntimeError(f"brand {brand_id} not found")
    name = rows[0]["brand_name"]
    imgs = pg_get(
        client, db_url, "/products",
        select="image_url",
        brand_node_id=f"eq.{brand_id}",
        is_brand_representative="eq.true",
        image_url="not.is.null",
        limit=10,
    )
    urls = [r["image_url"] for r in imgs if r.get("image_url")]
    return name, urls


# ─── Prompt template ───────────────────────────────────
def apply_template(body: str, runtime_vars: dict[str, str]) -> str:
    out = body
    for k, v in runtime_vars.items():
        out = out.replace("{{" + k + "}}", v)
    return out


# ─── Image download ─────────────────────────────────────
def detect_format(content_type: str | None, url: str) -> str:
    ct = (content_type or "").lower()
    if "png" in ct: return "png"
    if "gif" in ct: return "gif"
    if "webp" in ct: return "webp"
    if "jpeg" in ct or "jpg" in ct: return "jpeg"
    lower = url.lower()
    if lower.endswith(".png"): return "png"
    if lower.endswith(".gif"): return "gif"
    if lower.endswith(".webp"): return "webp"
    return "jpeg"


def download_image(client, url: str) -> tuple[bytes, str] | None:
    try:
        r = client.get(url, headers={"User-Agent": "kiko.ai-brand-attrs-bedrock/1.0"})
        if r.status_code != 200:
            return None
        if len(r.content) > 5_000_000:  # Nova 5MB 한도
            return None
        fmt = detect_format(r.headers.get("content-type"), url)
        return r.content, fmt
    except Exception:
        return None


# ─── Bedrock Converse call ──────────────────────────────
def call_bedrock(
    bedrock, model_id: str, system_md: str, user_md: str,
    images: list[tuple[bytes, str]], max_tokens: int, temperature: float,
) -> str:
    content: list[dict] = [{"text": user_md}]
    for img_bytes, fmt in images:
        content.append({
            "image": {
                "format": fmt,
                "source": {"bytes": img_bytes},
            }
        })
    response = bedrock.converse(
        modelId=model_id,
        system=[{"text": system_md}],
        messages=[{"role": "user", "content": content}],
        inferenceConfig={
            "maxTokens": max_tokens,
            "temperature": temperature,
        },
    )
    blocks = response["output"]["message"]["content"]
    for b in blocks:
        if "text" in b:
            return b["text"]
    return ""


# ─── Parse + Sanitize ──────────────────────────────────
def clean_json(s: str) -> str:
    s = s.strip()
    # strip code fences
    if s.startswith("```"):
        s = s.replace("```json", "").replace("```", "").strip()
    first = s.find("{")
    last = s.rfind("}")
    if first >= 0 and last > first:
        return s[first:last + 1]
    return s


def pick_array(raw, vocab: set[str], limit: int) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for v in raw:
        if not isinstance(v, str): continue
        if v not in vocab: continue
        if v in seen: continue
        seen.add(v)
        out.append(v)
        if len(out) >= limit: break
    return out


def pick_single(raw, vocab: set[str]) -> str | None:
    if isinstance(raw, list):
        for v in raw:
            if isinstance(v, str) and v in vocab:
                return v
        return None
    if isinstance(raw, str) and raw in vocab:
        return raw
    return None


def sanitize(parsed: dict) -> dict:
    out: dict = {}
    for f in ARRAY_FIELDS:
        out[f] = pick_array(parsed.get(f), VOCAB[f], PICK_LIMIT[f])
    for f in SINGLE_FIELDS:
        out[f] = pick_single(parsed.get(f), VOCAB[f])
    conf_raw = parsed.get("confidence", 0)
    try:
        conf = float(conf_raw)
    except (TypeError, ValueError):
        conf = 0.0
    out["confidence"] = round(max(0.0, min(1.0, conf)), 2)
    out["reasoning"] = str(parsed.get("reasoning") or "")[:600]
    return out


# ─── Per-brand worker ───────────────────────────────────
def process_brand(
    brand_id: int, prompt: dict, bedrock, db_url: str, db_token: str,
    model_id: str,
) -> dict:
    import httpx

    headers = {"Authorization": f"Bearer {db_token}"}
    with httpx.Client(timeout=60, headers=headers) as c:
        try:
            brand_name, image_urls = fetch_brand(c, db_url, brand_id)
        except Exception as exc:
            return {"ok": False, "result": "fetch_failed", "error": str(exc)[:200]}

        if not image_urls:
            return {"ok": True, "result": "insufficient_images", "reps_found": 0}

        # 이미지 다운로드 (병렬 in-brand)
        with ThreadPoolExecutor(max_workers=10) as pool:
            downloaded = list(pool.map(lambda u: download_image(c, u), image_urls))
        valid = [x for x in downloaded if x is not None]
        if not valid:
            return {"ok": True, "result": "insufficient_images", "fetched_ok": 0}

        # Prompt 빌드
        rt = {"BRAND_NAME": brand_name, "N_IMAGES": str(len(valid))}
        system_md = apply_template(prompt["system_md"], rt)
        user_md = apply_template(prompt["user_md"], rt)

        # Bedrock 호출
        try:
            raw = call_bedrock(
                bedrock, model_id, system_md, user_md, valid,
                int(prompt.get("max_tokens") or 2000),
                float(prompt.get("temperature") or 0.0),
            )
        except Exception as exc:
            return {"ok": False, "result": "bedrock_failed", "error": str(exc)[:200]}

        if not raw.strip():
            return {"ok": False, "result": "empty_response"}

        try:
            parsed = json.loads(clean_json(raw))
        except Exception:
            return {"ok": False, "result": "json_parse_failed", "raw": raw[:200]}

        sanitized = sanitize(parsed)

        # DB UPDATE
        try:
            pg_patch(
                c, db_url, "/brand_nodes",
                {"attributes": sanitized, "updated_at": datetime.now(timezone.utc).isoformat()},
                id=f"eq.{brand_id}",
            )
        except Exception as exc:
            return {"ok": False, "result": "update_failed", "error": str(exc)[:200]}

        return {
            "ok": True, "result": "extracted",
            "image_count": len(valid),
            "confidence": sanitized["confidence"],
        }


# ─── Main ───────────────────────────────────────────────
def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--force-all", action="store_true")
    p.add_argument("--workers", type=int, default=5)
    p.add_argument("--region", default=DEFAULT_REGION)
    p.add_argument("--model-id", default=DEFAULT_MODEL_ID)
    args = p.parse_args()

    root = Path(__file__).resolve().parent.parent
    env = load_env_local(root)
    db_url = env.get("DB_URL") or os.environ.get("DB_URL")
    db_token = env.get("DB_TOKEN") or os.environ.get("DB_TOKEN")
    if not db_url or not db_token:
        print("[fatal] DB_URL / DB_TOKEN 미설정", file=sys.stderr)
        return 2

    import httpx
    import boto3
    from botocore.config import Config as BotoConfig

    only_empty = not args.force_all

    print(f"[1/4] prompt + 대상 brand_id 수집 (only_empty={only_empty})...")
    with httpx.Client(timeout=60, headers={"Authorization": f"Bearer {db_token}"}) as c:
        prompt = fetch_prompt(c, db_url)
        target_ids = fetch_target_brand_ids(c, db_url, only_empty, args.limit)
    print(f"     prompt model_id={prompt.get('model_id')} max_tokens={prompt.get('max_tokens')}")
    print(f"     대상 {len(target_ids)} brand")
    if not target_ids:
        print("[done] 대상 없음")
        return 0

    if args.dry_run:
        print(f"[dry] region={args.region} model={args.model_id}")
        print(f"[dry] 처음 10건: {target_ids[:10]}")
        return 0

    print(f"[2/4] Bedrock 클라이언트 초기화 region={args.region} model={args.model_id}")
    bedrock = boto3.Session().client(
        "bedrock-runtime",
        region_name=args.region,
        config=BotoConfig(
            retries={"max_attempts": 5, "mode": "adaptive"},
            read_timeout=120,
            connect_timeout=10,
        ),
    )

    print(f"[3/4] 처리 시작 — workers={args.workers}")
    t0 = time.time()
    counts: Counter = Counter()
    failures: list[tuple[int, str]] = []

    total = len(target_ids)
    width = len(str(total))
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(
                process_brand, bid, prompt, bedrock, db_url, db_token, args.model_id,
            ): bid for bid in target_ids
        }
        done = 0
        for f in as_completed(futures):
            bid = futures[f]
            res = f.result()
            done += 1
            ok = res.get("ok", False)
            label = res.get("result", "?") if ok else f"FAIL/{res.get('result', '?')}"
            counts[label] += 1
            if not ok:
                failures.append((bid, res.get("error", "?")[:150]))

            # per-brand 라인 (한 줄 — 깔끔)
            marker = "✓" if ok else "✗"
            extra = ""
            if ok and res.get("result") == "extracted":
                extra = f" conf={res.get('confidence', '?')} img={res.get('image_count', '?')}"
            elif not ok:
                extra = f" err={res.get('error', '?')[:60]}"
            print(
                f"  [{done:>{width}}/{total}] {marker} brand={bid:>4} "
                f"{label}{extra}",
                flush=True,
            )

            # 25건마다 집계 + rate
            if done % 25 == 0 or done == total:
                elapsed = time.time() - t0
                rate = done / max(elapsed, 1e-6)
                eta = (total - done) / max(rate, 1e-6)
                print(
                    f"  ── progress: {done}/{total} "
                    f"({rate:.2f}/s, ETA {eta:.0f}s) — {dict(counts)}",
                    flush=True,
                )

    elapsed = time.time() - t0
    print(f"\n[4/4] 완료 elapsed={elapsed:.1f}s")
    print(f"     결과 분포: {dict(counts)}")
    if failures:
        print(f"     실패 {len(failures)}건 (첫 10):")
        for bid, err in failures[:10]:
            print(f"       brand_id={bid}: {err}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
