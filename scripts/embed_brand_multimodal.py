"""SPEC-BRAND-EMBED-001 P2 (revised 2026-05-20): brand multimodal vector backfill.

대상: 대표상품 보유 + brand-attributes v1 (13-key) 채워진 brand.

흐름 (brand 1건):
  1) products WHERE brand_node_id=$1 AND is_brand_representative=true
     ORDER BY id ASC LIMIT 10 → 대표 이미지 URL N장 (1~10)
  2) attributes JSON 의 vocab token 만 모아 1 text chunk 구성
     (brand_name 제거 — SigLIP text encoder 가 brand prior 끌어당기는 노이즈)
  3) SigLIP image encoder × N 장 + text encoder × 1 chunk
     → L2-normalize → 평균 → 최종 L2-normalize
  4) brand_multimodal_embeddings UPSERT

변경 사항 (이전 버전 대비):
  - brand_nodes.representative_image_urls (mig 067 DROP) → products JOIN
  - brand_nodes.brand_keywords (mig 067 DROP) → attributes 만 사용
  - "fashion brand X" prompt 제거 (brand_name 입력 X)
  - MAX_IMAGES: 5 → 10
  - text chunk: brand_name + keywords + 3 attr chunk → attributes 1 chunk

모델: Marqo/marqo-fashionSigLIP (v5/v6 product 임베딩과 동일 공간).

Idempotent: source_text_hash + source_image_hash 일치 시 skip (--force 무시).

사용:
  cd /Users/hansangho/Desktop/kikoai/app
  uv run --with open_clip_torch --with supabase --with httpx --with pillow --with torch \\
      python scripts/embed_brand_multimodal.py --limit 5 --dry-run
  uv run python scripts/embed_brand_multimodal.py                    # 풀배치 (only-missing)
  uv run python scripts/embed_brand_multimodal.py --force            # hash 일치해도 재임베딩
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

MODEL_ID = "hf-hub:Marqo/marqo-fashionSigLIP"
EMBEDDING_MODEL_NAME = "Marqo/marqo-fashionSigLIP"
DIM = 768
STRATEGY = "mean_image10_attr_chunk"  # 변경: image5_text_chunks → image10_attr_chunk

MAX_IMAGES_PER_BRAND = 10  # 5 → 10
DOWNLOAD_WORKERS = 10
HTTP_TIMEOUT = 20
MAX_IMAGE_BYTES = 10 * 1024 * 1024

ARRAY_ATTR_FIELDS = ("vibe", "palette", "material", "silhouette", "detail", "pattern")
SINGLE_ATTR_FIELDS = ("gender_lean", "formality", "price_tier", "era_reference", "subculture")


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


def build_attr_tokens(attrs: dict) -> list[str]:
    """attributes JSON → ordered token list.

    배열 필드 먼저 (vibe → palette → material → silhouette → detail → pattern),
    단일 필드 뒤. 'none' subculture 등 의미 없는 값은 제외.
    hash 안정성 위해 결정적 순서 유지.
    """
    if not isinstance(attrs, dict) or not attrs:
        return []
    tokens: list[str] = []
    for f in ARRAY_ATTR_FIELDS:
        vals = attrs.get(f)
        if isinstance(vals, list):
            for v in vals:
                if isinstance(v, str) and v:
                    tokens.append(v)
    for f in SINGLE_ATTR_FIELDS:
        v = attrs.get(f)
        if isinstance(v, str) and v and v != "none":
            tokens.append(v)
    return tokens


def build_text_chunks(attrs: dict) -> list[str]:
    """SigLIP text encoder 입력. attributes vocab token 만 1 chunk 로 join.

    SigLIP text 한도 77 token. 평균 attribute token ~20개 (배열 6 * 평균 3 + 단일 5)
    → SigLIP tokenize 후 ~40-60 token, 한도 내. 분할 불필요.
    """
    tokens = build_attr_tokens(attrs)
    if not tokens:
        return []
    return [", ".join(tokens)]


def stable_hash(items: list[str]) -> str:
    payload = json.dumps(items, ensure_ascii=False)  # 순서 유지 (sort X)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def download_one(client, url: str):
    try:
        from PIL import Image  # noqa: WPS433
        r = client.get(url)
        r.raise_for_status()
        if len(r.content) > MAX_IMAGE_BYTES:
            return None
        return Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        print(f"     [warn] image download failed {url[:60]}...: {exc}", file=sys.stderr)
        return None


def fetch_target_brands(sb, limit: Optional[int]) -> list[dict]:
    """대상: 대표상품 보유 brand 중 attributes 채워진 것."""
    # 1) 대표상품 보유 brand_id (distinct)
    reps = (
        sb.table("products")
        .select("brand_node_id")
        .eq("is_brand_representative", True)
        .not_.is_("brand_node_id", "null")
        .execute()
        .data
        or []
    )
    rep_ids = sorted({r["brand_node_id"] for r in reps})

    # 2) brand metadata (attributes 동반)
    out: list[dict] = []
    # PostgREST IN() 절은 URL 길이 한도 있음 — 200개씩 chunk
    for i in range(0, len(rep_ids), 200):
        chunk_ids = rep_ids[i : i + 200]
        rows = (
            sb.table("brand_nodes")
            .select("id, brand_name, attributes")
            .in_("id", chunk_ids)
            .execute()
            .data
            or []
        )
        for r in rows:
            if r.get("attributes"):  # 비어있지 않은 것만
                out.append(r)

    # id 순으로 정렬 (deterministic processing order)
    out.sort(key=lambda r: r["id"])
    return out[:limit] if limit else out


def fetch_image_urls(sb, brand_id: int) -> list[str]:
    """brand 의 대표상품 image_url N장 (deterministic ORDER BY id ASC)."""
    rows = (
        sb.table("products")
        .select("id, image_url")
        .eq("brand_node_id", brand_id)
        .eq("is_brand_representative", True)
        .not_.is_("image_url", "null")
        .order("id", desc=False)
        .limit(MAX_IMAGES_PER_BRAND)
        .execute()
        .data
        or []
    )
    return [r["image_url"] for r in rows if r.get("image_url")]


def fetch_existing_hashes(sb) -> dict[int, tuple[Optional[str], Optional[str]]]:
    rows = (
        sb.table("brand_multimodal_embeddings")
        .select("brand_id, source_text_hash, source_image_hash")
        .execute()
        .data
        or []
    )
    return {r["brand_id"]: (r.get("source_text_hash"), r.get("source_image_hash")) for r in rows}


def encode_brand(
    model, preprocess, tokenizer, device, brand: dict, image_urls: list[str], http
) -> Optional[dict]:
    import numpy as np
    import torch

    text_chunks = build_text_chunks(brand.get("attributes") or {})

    # ─── 1) 이미지 다운로드 (병렬) ────────────────────
    images = []
    with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as pool:
        futures = [pool.submit(download_one, http, u) for u in image_urls]
        for f in as_completed(futures):
            img = f.result()
            if img is not None:
                images.append(img)

    if not images and not text_chunks:
        return None

    vectors: list = []

    # ─── 2) image encoder ────────────────────────────
    if images:
        batch = torch.stack([preprocess(img) for img in images]).to(device)
        with torch.no_grad():
            feats = model.encode_image(batch)
            feats = feats / feats.norm(dim=-1, keepdim=True)
        vectors.extend(feats.cpu().float().numpy())

    # ─── 3) text encoder ────────────────────────────
    if text_chunks:
        tokens = tokenizer(text_chunks).to(device)
        with torch.no_grad():
            feats = model.encode_text(tokens)
            feats = feats / feats.norm(dim=-1, keepdim=True)
        vectors.extend(feats.cpu().float().numpy())

    if not vectors:
        return None

    mean = np.mean(np.stack(vectors), axis=0)
    final = mean / (np.linalg.norm(mean) + 1e-12)

    return {
        "brand_id": brand["id"],
        "vector": "[" + ",".join(f"{x:.6f}" for x in final.tolist()) + "]",
        "embedding_model": EMBEDDING_MODEL_NAME,
        "strategy": STRATEGY,
        "source_image_count": len(images),
        "source_text_hash": stable_hash(build_attr_tokens(brand.get("attributes") or {})),
        "source_image_hash": stable_hash(image_urls),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--limit", type=int, default=None, help="brand 수 제한 (테스트용)")
    parser.add_argument("--dry-run", action="store_true", help="DB 쓰지 않음")
    parser.add_argument("--force", action="store_true", help="hash 일치해도 재임베딩")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    env = load_env_local(root)
    db_url = env.get("DB_URL") or os.environ.get("DB_URL")
    db_token = env.get("DB_TOKEN") or os.environ.get("DB_TOKEN")
    if not db_url or not db_token:
        print("[fatal] DB_URL / DB_TOKEN 미설정 (.env.local 확인)", file=sys.stderr)
        return 2

    from supabase import create_client

    sb = create_client(db_url, db_token)

    print("[1/5] 대상 brand 로드 (대표상품 보유 + attributes 채워짐)...")
    brands = fetch_target_brands(sb, args.limit)
    print(f"     {len(brands)} brand")
    if not brands:
        print("[done] 대상 없음 — Step 1 (attributes 백필) 먼저")
        return 0

    existing = fetch_existing_hashes(sb)
    print(f"[2/5] 기존 임베딩 row: {len(existing)}")

    print(f"[3/5] {MODEL_ID} 로드 중 (첫 1회 가중치 다운로드 ~700MB)...")
    import torch
    import open_clip
    import httpx

    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"
    print(f"     device={device}")

    model, _, preprocess = open_clip.create_model_and_transforms(MODEL_ID)
    model = model.to(device).eval()
    tokenizer = open_clip.get_tokenizer(MODEL_ID)

    print(f"[4/5] 인코딩 + UPSERT — {len(brands)} brand, MAX_IMAGES={MAX_IMAGES_PER_BRAND}")
    t0 = time.time()
    embedded = 0
    skipped = 0
    failed = 0
    no_images = 0

    total = len(brands)
    width = len(str(total))

    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as http:
        for i, brand in enumerate(brands, start=1):
            bid = brand["id"]
            bname = brand.get("brand_name") or "?"

            # 이미지 URL fetch
            image_urls = fetch_image_urls(sb, bid)
            if not image_urls:
                no_images += 1
                print(f"  [{i:>{width}}/{total}] - brand={bid:>4} {bname[:30]:<30} no_images")
                continue

            # idempotency check
            if not args.force:
                cur_text_hash = stable_hash(build_attr_tokens(brand.get("attributes") or {}))
                cur_image_hash = stable_hash(image_urls)
                prev = existing.get(bid)
                if prev and prev == (cur_text_hash, cur_image_hash):
                    skipped += 1
                    print(f"  [{i:>{width}}/{total}] = brand={bid:>4} {bname[:30]:<30} skip(hash)")
                    continue

            try:
                row = encode_brand(model, preprocess, tokenizer, device, brand, image_urls, http)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"  [{i:>{width}}/{total}] ✗ brand={bid:>4} {bname[:30]:<30} ERR {exc}", file=sys.stderr)
                continue

            if row is None:
                failed += 1
                print(f"  [{i:>{width}}/{total}] ✗ brand={bid:>4} {bname[:30]:<30} no_usable_inputs", file=sys.stderr)
                continue

            if args.dry_run:
                print(
                    f"  [{i:>{width}}/{total}] DRY brand={bid:>4} {bname[:30]:<30} "
                    f"img={row['source_image_count']} text_h={row['source_text_hash'][:8]}"
                )
            else:
                sb.table("brand_multimodal_embeddings").upsert(row, on_conflict="brand_id").execute()
                print(
                    f"  [{i:>{width}}/{total}] ✓ brand={bid:>4} {bname[:30]:<30} "
                    f"img={row['source_image_count']}"
                )

            embedded += 1
            if i % 50 == 0:
                rate = embedded / max(time.time() - t0, 1e-6)
                eta = (total - i) / max(rate, 1e-6)
                print(f"  ── progress: {i}/{total} (rate={rate:.2f}/s, ETA {eta:.0f}s)")

    elapsed = time.time() - t0
    print(
        f"\n[5/5] 완료 embedded={embedded} skipped={skipped} no_images={no_images} "
        f"failed={failed} elapsed={elapsed:.1f}s"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
