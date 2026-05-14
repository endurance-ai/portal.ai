"""SPEC-BRAND-EMBED-001 P2: brand multimodal vector backfill.

분류된 (primary_style_node_id NOT NULL) brand 마다:
  1) representative_image_urls 최대 5장 (실제 1~5) → SigLIP image encoder → K × 768
  2) 텍스트 풀을 4-5 chunk 로 분할 → SigLIP text encoder → N × 768
  3) 모든 벡터 평균 → L2-normalize → 최종 768-dim brand vector
  4) brand_multimodal_embeddings UPSERT

모델: Marqo/marqo-fashionSigLIP (v5 product 임베딩과 동일 공간).

Idempotent: (source_text_hash, source_image_hash) 일치 시 skip (--force 로 무시).

사용 (로컬 Mac, MPS):
    cd /Users/hansangho/Desktop/kikoai/app
    uv run --with open_clip_torch --with supabase --with httpx --with pillow --with torch \\
        python scripts/embed_brand_multimodal.py --limit 5 --dry-run

    # 실 실행 (전체)
    uv run python scripts/embed_brand_multimodal.py

원격 (g5 spot) 실행은 scripts/aws/launch_brand_embed_batch.sh (별도).
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
STRATEGY = "mean_image5_text_chunks"

MAX_IMAGES_PER_BRAND = 5
DOWNLOAD_WORKERS = 10
HTTP_TIMEOUT = 20
MAX_IMAGE_BYTES = 10 * 1024 * 1024


def load_env_local(root: Path) -> dict[str, str]:
    """Parse .env.local without dotenv dep (project standard)."""
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


def build_text_chunks(brand: dict) -> list[str]:
    """Split brand text into <=77-token chunks for SigLIP text encoder.

    Strategy: encode each chunk fully (no truncation), average resulting vectors.
    Order matters only for the source_text_hash; semantic mix is by mean.
    """
    name = (brand.get("brand_name") or "").strip()
    keywords = list(brand.get("brand_keywords") or [])
    attrs = brand.get("attributes") or {}
    vibe = list(attrs.get("vibe") or [])
    silhouette = list(attrs.get("silhouette") or [])
    palette = list(attrs.get("palette") or [])
    material = list(attrs.get("material") or [])
    detail = list(attrs.get("detail") or [])

    chunks: list[str] = []
    if name:
        chunks.append(f"fashion brand {name}")

    # brand_keywords 를 ~8개 단위로 분할 (각 chunk ~30-50 tokens 예상)
    for i in range(0, len(keywords), 8):
        kw_chunk = keywords[i : i + 8]
        if kw_chunk:
            chunks.append(", ".join(kw_chunk))

    aesthetic_terms = [*vibe, *silhouette]
    if aesthetic_terms:
        chunks.append(", ".join(aesthetic_terms))

    visual_terms = [*palette, *material, *detail]
    if visual_terms:
        chunks.append(", ".join(visual_terms))

    # 최소 1개 보장 (brand_name 만이라도)
    if not chunks and name:
        chunks.append(name)

    return chunks


def stable_hash(items: list[str]) -> str:
    payload = json.dumps(sorted(items), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def download_one(client, url: str) -> Optional["Image.Image"]:
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


def fetch_classified_brands(sb, limit: Optional[int]) -> list[dict]:
    q = (
        sb.table("brand_nodes")
        .select(
            "id, brand_name, brand_keywords, attributes, "
            "representative_image_urls, primary_style_node_id"
        )
        .not_.is_("primary_style_node_id", "null")
        .not_.is_("representative_image_urls", "null")
    )
    if limit:
        q = q.limit(limit)
    return q.execute().data or []


def fetch_existing_hashes(sb) -> dict[int, tuple[str | None, str | None]]:
    rows = (
        sb.table("brand_multimodal_embeddings")
        .select("brand_id, source_text_hash, source_image_hash")
        .execute()
        .data
        or []
    )
    return {r["brand_id"]: (r.get("source_text_hash"), r.get("source_image_hash")) for r in rows}


def encode_brand(model, preprocess, tokenizer, device, brand: dict, http) -> Optional[dict]:
    import numpy as np
    import torch

    image_urls = list(brand.get("representative_image_urls") or [])[:MAX_IMAGES_PER_BRAND]
    text_chunks = build_text_chunks(brand)

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

    vectors: list[np.ndarray] = []

    # ─── 2) image encoder ────────────────────────────
    if images:
        batch = torch.stack([preprocess(img) for img in images]).to(device)
        with torch.no_grad():
            feats = model.encode_image(batch)
            feats = feats / feats.norm(dim=-1, keepdim=True)
        vectors.extend(feats.cpu().float().numpy())

    # ─── 3) text encoder (chunk-by-chunk, average) ──
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
        "source_text_hash": stable_hash(text_chunks),
        "source_image_hash": stable_hash(image_urls),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--limit", type=int, default=None, help="brand 수 제한 (테스트용)")
    parser.add_argument("--dry-run", action="store_true", help="DB 쓰지 않음 (sample 출력)")
    parser.add_argument("--force", action="store_true", help="hash 일치해도 재임베딩")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    env = load_env_local(root)
    db_url = env.get("DB_URL") or os.environ.get("DB_URL")
    db_token = env.get("DB_TOKEN") or os.environ.get("DB_TOKEN")
    if not db_url or not db_token:
        print("[fatal] DB_URL / DB_TOKEN 미설정 (.env.local 확인)", file=sys.stderr)
        return 2

    # supabase-py 는 PostgREST + JWT 만 있으면 self-host 에서도 동작
    from supabase import create_client

    sb = create_client(db_url, db_token)

    print("[1/4] 분류된 brand 로드 중...")
    brands = fetch_classified_brands(sb, args.limit)
    print(f"     {len(brands)}개 (representative_image_urls + primary_style_node_id 둘 다 보유)")

    if not brands:
        print("[done] 분류된 brand 가 없음 — 종료")
        return 0

    existing = fetch_existing_hashes(sb)
    print(f"[2/4] 기존 임베딩 row: {len(existing)}개")

    print(f"[3/4] {MODEL_ID} 로드 중 (첫 1회 가중치 다운로드 ~700MB)...")
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

    print(f"[4/4] 인코딩 + UPSERT ({len(brands)} brands)...")
    t0 = time.time()
    embedded = 0
    skipped = 0
    failed = 0

    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as http:
        for i, brand in enumerate(brands, start=1):
            if not args.force:
                # idempotency: hash 비교
                cur_text_hash = stable_hash(build_text_chunks(brand))
                cur_image_hash = stable_hash(list(brand.get("representative_image_urls") or [])[:MAX_IMAGES_PER_BRAND])
                prev = existing.get(brand["id"])
                if prev and prev == (cur_text_hash, cur_image_hash):
                    skipped += 1
                    continue

            try:
                row = encode_brand(model, preprocess, tokenizer, device, brand, http)
            except Exception as exc:  # noqa: BLE001
                print(f"     [fail] brand_id={brand['id']} {brand['brand_name']}: {exc}", file=sys.stderr)
                failed += 1
                continue

            if row is None:
                print(f"     [skip] brand_id={brand['id']} {brand['brand_name']}: no usable inputs", file=sys.stderr)
                failed += 1
                continue

            if args.dry_run:
                vec_preview = row["vector"][:60]
                print(
                    f"     [dry] {brand['brand_name']:<20} "
                    f"images={row['source_image_count']} "
                    f"text_h={row['source_text_hash'][:8]} "
                    f"vec={vec_preview}..."
                )
            else:
                # UPSERT (PK = brand_id)
                sb.table("brand_multimodal_embeddings").upsert(row, on_conflict="brand_id").execute()

            embedded += 1
            if i % 25 == 0:
                rate = embedded / max(time.time() - t0, 1e-6)
                print(f"     ... {i}/{len(brands)} (rate={rate:.1f}/s)")

    elapsed = time.time() - t0
    print(
        f"[end] embedded={embedded} skipped={skipped} failed={failed} "
        f"elapsed={elapsed:.1f}s"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
