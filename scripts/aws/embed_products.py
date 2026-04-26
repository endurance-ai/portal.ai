"""
FashionSigLIP 이미지 임베딩 배치 — EC2 Spot 실행용 standalone 스크립트

사전 조건
  - DLAMI (Deep Learning AMI GPU PyTorch) — torch/CUDA 프리인스톨
  - pip: open_clip_torch, supabase, httpx, pillow
  - env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (선택) LIMIT

동작
  1. products.embedding IS NULL 페이지네이션 조회
  2. images[0] ThreadPool(20)로 병렬 다운로드
  3. GPU 배치(64) 인코딩 + L2 정규화
  4. bulk_update_product_embeddings RPC로 일괄 upsert
  5. 모든 페이지 완료될 때까지 반복
"""
from __future__ import annotations

import io
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import httpx
import open_clip
import torch
from PIL import Image
from supabase import create_client

MODEL_ID = "hf-hub:Marqo/marqo-fashionSigLIP"
EMBEDDING_MODEL_NAME = "Marqo/marqo-fashionSigLIP"

GPU_BATCH = 64           # GPU forward-pass 배치
FETCH_PAGE = 500         # Supabase 페이지 크기
RPC_BATCH = 200          # bulk RPC 당 상품 수
DOWNLOAD_WORKERS = 20    # 이미지 병렬 다운로드 워커
MAX_IMAGE_BYTES = 10 * 1024 * 1024
HTTP_TIMEOUT = 20


def download_one(client: httpx.Client, pid: str, url: str) -> Optional[tuple[str, Image.Image]]:
    try:
        r = client.get(url)
        r.raise_for_status()
        if len(r.content) > MAX_IMAGE_BYTES:
            return None
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        return (pid, img)
    except Exception:
        return None


def main() -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[fatal] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정", file=sys.stderr)
        return 2

    limit_env = os.environ.get("LIMIT")
    limit = int(limit_env) if limit_env else None

    sb = create_client(url, key)

    print(f"[load] {MODEL_ID}")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL_ID)
    model = model.to(device).eval()
    print(f"[load] ready on {device}")

    total_embedded = 0
    total_skipped = 0
    total_failed = 0
    processed = 0
    t_start = time.time()

    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as http:
        while True:
            page_limit = FETCH_PAGE
            if limit is not None:
                remaining = limit - processed
                if remaining <= 0:
                    break
                page_limit = min(FETCH_PAGE, remaining)

            resp = (
                sb.table("products")
                .select("id,images")
                .is_("embedding", "null")
                .not_.is_("images", "null")
                .limit(page_limit)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                print("[done] no more pending products")
                break

            jobs: list[tuple[str, str]] = []
            for row in rows:
                imgs = row.get("images") or []
                if not imgs or not imgs[0]:
                    total_skipped += 1
                    continue
                jobs.append((row["id"], imgs[0]))

            if not jobs:
                processed += len(rows)
                continue

            # 병렬 다운로드 — 20 워커
            fetched: list[tuple[str, Image.Image]] = []
            with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as pool:
                futures = [pool.submit(download_one, http, pid, url) for pid, url in jobs]
                for f in as_completed(futures):
                    result = f.result()
                    if result is None:
                        total_failed += 1
                    else:
                        fetched.append(result)

            if not fetched:
                processed += len(rows)
                continue

            # GPU 배치 인코딩
            updates: list[dict] = []
            for i in range(0, len(fetched), GPU_BATCH):
                chunk = fetched[i : i + GPU_BATCH]
                tensors = torch.stack([preprocess(img) for _, img in chunk]).to(device)
                with torch.no_grad():
                    feats = model.encode_image(tensors)
                    feats = feats / feats.norm(dim=-1, keepdim=True)
                vecs = feats.cpu().float().numpy()
                for (pid, _), vec in zip(chunk, vecs):
                    updates.append({
                        "id": pid,
                        "embedding": "[" + ",".join(f"{x:.6f}" for x in vec.tolist()) + "]",
                        "model": EMBEDDING_MODEL_NAME,
                    })

            for i in range(0, len(updates), RPC_BATCH):
                batch = updates[i : i + RPC_BATCH]
                sb.rpc("bulk_update_product_embeddings", {"payload": batch}).execute()

            total_embedded += len(updates)
            processed += len(rows)
            elapsed = time.time() - t_start
            rate = total_embedded / elapsed if elapsed > 0 else 0
            print(
                f"[page] processed={processed} embedded={total_embedded} "
                f"skipped={total_skipped} failed={total_failed} rate={rate:.1f}/s"
            )

    print(
        f"[end] processed={processed} embedded={total_embedded} "
        f"skipped={total_skipped} failed={total_failed} "
        f"elapsed={round(time.time() - t_start, 1)}s"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
