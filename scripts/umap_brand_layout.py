"""brand_nodes.embedding (1024D) → UMAP 2D 좌표 캐시.

검색-기반 브랜드 그래프 시각화용. force-directed 대신 의미적 임베딩의 2D 투영을
클라이언트가 그대로 그림. 일주일에 한 번 갱신 권장.

사용:
  cd ../ai
  uv add umap-learn  # 첫 1회만
  uv run python /Users/hansangho/Desktop/portal/app/scripts/umap_brand_layout.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent.parent.parent / "ai"
sys.path.insert(0, str(AI_ROOT))

from app.core.config import settings
from supabase import create_client

sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def load_all_with_embedding():
    out, off = [], 0
    while True:
        chunk = (sb.table("brand_nodes")
                 .select("id, embedding")
                 .not_.is_("embedding", "null")
                 .range(off, off + 999).execute().data)
        if not chunk:
            break
        out.extend(chunk)
        if len(chunk) < 1000:
            break
        off += 1000
    return out


def main():
    import numpy as np

    print("[1/4] embedding 보유 brand_nodes 로드...")
    rows = load_all_with_embedding()
    print(f"     {len(rows)}개")

    if len(rows) < 10:
        print("UMAP에 노드 부족 (<10) — 종료")
        return

    print("[2/4] embedding 변환...")
    def to_vec(e):
        if isinstance(e, str):
            return np.fromstring(e.strip("[]"), sep=",", dtype=np.float32)
        return np.array(e, dtype=np.float32)
    M = np.stack([to_vec(r["embedding"]) for r in rows])
    print(f"     matrix: {M.shape}")

    print("[3/4] UMAP 투영 1024D → 2D...")
    import umap  # type: ignore
    t0 = time.time()
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
    )
    coords = reducer.fit_transform(M)
    print(f"     완료 {time.time()-t0:.1f}s, shape={coords.shape}")

    # 좌표 정규화 — 화면에 맞게 [-100, 100] 범위로
    coords = coords - coords.mean(axis=0)
    scale = max(abs(coords.min()), abs(coords.max()))
    coords = coords / scale * 100.0

    print(f"[4/4] DB 업데이트 ({len(rows)} rows, 동시 8 thread)...")
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading
    progress = {"n": 0, "err": 0}
    lock = threading.Lock()

    def update_one(r, xy):
        try:
            sb.table("brand_nodes").update({
                "x_umap": float(xy[0]),
                "y_umap": float(xy[1]),
                "umap_at": "now()",
            }).eq("id", r["id"]).execute()
            return None
        except Exception as e:
            return str(e)

    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(update_one, r, xy) for r, xy in zip(rows, coords)]
        for fut in as_completed(futures):
            err = fut.result()
            with lock:
                progress["n"] += 1
                if err:
                    progress["err"] += 1
                if progress["n"] % 200 == 0 or progress["n"] == len(rows):
                    print(f"     {progress['n']}/{len(rows)} (err={progress['err']})")

    print(f"완료. 실패: {progress['err']}")


if __name__ == "__main__":
    main()
