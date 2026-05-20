"""brand_multimodal_embeddings.vector → HDBSCAN cluster_id 부여.

흐름:
  1) brand_multimodal_embeddings 전체 로드 (N × 768 halfvec)
  2) UMAP 768→20-dim (n_neighbors=15, min_dist=0, cosine)
     — 2D 시각화용 UMAP (build_brand_umap.py) 과 별개 fit
     — HDBSCAN 은 ~10-50 dim 에서 best (768-dim 차원의 저주, 2D 너무 lossy)
  3) HDBSCAN (min_cluster_size, min_samples 인자) → cluster_id
     — noise 는 -1
  4) brand_multimodal_umap.cluster_id + cluster_computed_at UPSERT
  5) 통계: 클러스터 수, noise %, primary_style_node_id 와의 NMI

사용:
  cd /Users/hansangho/Desktop/kikoai/app
  uv run --with supabase --with numpy --with umap-learn --with hdbscan --with scikit-learn \\
      python scripts/build_brand_clusters.py
  uv run ... python scripts/build_brand_clusters.py --min-cluster-size 15 --min-samples 8 --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from pathlib import Path


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


def parse_vector(raw) -> list[float]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        return [float(x) for x in raw.strip("[]").split(",") if x.strip()]
    raise ValueError(f"unexpected vector type: {type(raw)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--umap-dim", type=int, default=20)
    parser.add_argument("--umap-neighbors", type=int, default=15)
    parser.add_argument("--umap-min-dist", type=float, default=0.0)
    parser.add_argument("--min-cluster-size", type=int, default=10)
    parser.add_argument("--min-samples", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    env = load_env_local(root)
    db_url = env.get("DB_URL") or os.environ.get("DB_URL")
    db_token = env.get("DB_TOKEN") or os.environ.get("DB_TOKEN")
    if not db_url or not db_token:
        print("[fatal] DB_URL / DB_TOKEN 미설정", file=sys.stderr)
        return 2

    import numpy as np
    import umap
    import hdbscan
    from supabase import create_client
    from sklearn.metrics import normalized_mutual_info_score

    sb = create_client(db_url, db_token)

    print("[1/5] brand_multimodal_embeddings 로드...")
    emb_rows = (
        sb.table("brand_multimodal_embeddings")
        .select("brand_id, vector")
        .execute()
        .data
        or []
    )
    n = len(emb_rows)
    print(f"     {n} brand vector")
    if n < 50:
        print("[fatal] 50개 미만 — HDBSCAN clustering 의미 없음", file=sys.stderr)
        return 2

    ids = [r["brand_id"] for r in emb_rows]
    mat = np.stack([np.asarray(parse_vector(r["vector"]), dtype=np.float32) for r in emb_rows])
    print(f"     matrix shape={mat.shape}")

    print(
        f"[2/5] UMAP fit 768→{args.umap_dim} "
        f"(n_neighbors={args.umap_neighbors}, min_dist={args.umap_min_dist})..."
    )
    reducer = umap.UMAP(
        n_components=args.umap_dim,
        n_neighbors=args.umap_neighbors,
        min_dist=args.umap_min_dist,
        metric="cosine",
        random_state=args.seed,
    )
    reduced = reducer.fit_transform(mat)
    print(f"     reduced shape={reduced.shape}")

    print(
        f"[3/5] HDBSCAN fit "
        f"(min_cluster_size={args.min_cluster_size}, min_samples={args.min_samples})..."
    )
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=args.min_cluster_size,
        min_samples=args.min_samples,
        metric="euclidean",  # UMAP 축소 후라 euclidean ok
        cluster_selection_method="eom",
    )
    labels = clusterer.fit_predict(reduced)

    # 통계
    cluster_counts = Counter(int(l) for l in labels)
    n_clusters = len([c for c in cluster_counts if c != -1])
    n_noise = cluster_counts.get(-1, 0)
    print(f"     clusters={n_clusters}  noise={n_noise} ({n_noise*100/n:.1f}%)")
    top = sorted([(c, cnt) for c, cnt in cluster_counts.items() if c != -1], key=lambda x: -x[1])
    print(f"     클러스터 size 상위 10:")
    for c, cnt in top[:10]:
        print(f"       cluster {c:>3}: {cnt} brand")
    if len(top) > 10:
        print(f"       ... + {len(top) - 10} more")

    print("[4/5] primary_style_node_id 와의 NMI 계산...")
    # 같은 brand_id 들에 대한 primary_style_node_id fetch (chunk 200씩)
    bn_rows = []
    for i in range(0, len(ids), 200):
        chunk = ids[i:i+200]
        rows = (
            sb.table("brand_nodes")
            .select("id, primary_style_node_id")
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        bn_rows.extend(rows)
    style_by_id = {r["id"]: r.get("primary_style_node_id") for r in bn_rows}
    valid_pairs = [
        (labels[i], style_by_id.get(bid))
        for i, bid in enumerate(ids)
        if style_by_id.get(bid) is not None and labels[i] != -1
    ]
    if valid_pairs:
        c_arr, s_arr = zip(*valid_pairs)
        nmi = normalized_mutual_info_score(s_arr, c_arr)
        print(f"     NMI(LLM primary_style_node vs HDBSCAN cluster) = {nmi:.4f}  ({len(valid_pairs)} brand pair)")
        print("     (1.0=완전 일치, 0=무관. 0.3~0.6 면 의미있는 상관)")
    else:
        print("     [warn] valid pair 0 — NMI 계산 불가")

    if args.dry_run:
        print("[5/5] DRY RUN — UPSERT 안 함")
        return 0

    print(f"[5/5] brand_multimodal_umap.cluster_id UPDATE ({n} rows)...")
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    # x, y, computed_at 은 NOT NULL 이라 upsert 가 INSERT path 에서 거부 →
    # 각 row PATCH (PostgREST update) 로 cluster_id 만 갱신.
    # 2,180 row × ms 단위 → 수십 초.
    success = 0
    for i, bid in enumerate(ids):
        try:
            sb.table("brand_multimodal_umap").update({
                "cluster_id": int(labels[i]),
                "cluster_computed_at": now_iso,
            }).eq("brand_id", int(bid)).execute()
            success += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  [warn] brand_id={bid} update failed: {exc}", file=sys.stderr)
        if (i + 1) % 200 == 0:
            print(f"  ... {i+1}/{n}")
    print(f"[done] updated={success}/{n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
