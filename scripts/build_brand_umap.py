"""SPEC-BRAND-EMBED-001 P6: brand_multimodal_embeddings → UMAP 2D 좌표.

매 실행 시 전체 재계산 후 brand_multimodal_umap UPSERT.
UMAP 은 incremental fit 미지원 — 새 brand 가 추가되면 전체 재계산이 자연.

데이터 적을 때 (n < 10) UMAP 의미 없음 → 그래도 좌표는 만듦 (admin 페이지 동작 확인용).
n_neighbors 는 자동으로 (n-1) 클램프.

사용:
    uv run --with supabase --with numpy --with umap-learn python scripts/build_brand_umap.py
"""
from __future__ import annotations

import argparse
import os
import sys
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
    parser.add_argument("--n-neighbors", type=int, default=15)
    parser.add_argument("--min-dist", type=float, default=0.1)
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
    from supabase import create_client

    sb = create_client(db_url, db_token)

    print("[1/3] brand_multimodal_embeddings 로드...")
    rows = (
        sb.table("brand_multimodal_embeddings")
        .select("brand_id, vector")
        .execute()
        .data
        or []
    )
    n = len(rows)
    print(f"     {n} brand vector")
    if n < 2:
        print("[done] 2개 미만 — UMAP 불가")
        return 0

    ids = [r["brand_id"] for r in rows]
    mat = np.stack([np.asarray(parse_vector(r["vector"]), dtype=np.float32) for r in rows])

    print(f"[2/3] UMAP fit (n={n}, n_neighbors=min({args.n_neighbors}, {n - 1}))...")
    nn = max(2, min(args.n_neighbors, n - 1))
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=nn,
        min_dist=args.min_dist,
        metric="cosine",
        random_state=args.seed,
    )
    coords = reducer.fit_transform(mat)
    print(f"     coords shape={coords.shape}")

    if args.dry_run:
        print("[3/3] DRY RUN — sample:")
        for i, bid in enumerate(ids[:5]):
            print(f"     brand_id={bid} x={coords[i, 0]:.3f} y={coords[i, 1]:.3f}")
        return 0

    print(f"[3/3] brand_multimodal_umap UPSERT ({n} rows)...")
    payload = [
        {"brand_id": int(bid), "x": float(coords[i, 0]), "y": float(coords[i, 1])}
        for i, bid in enumerate(ids)
    ]
    for i in range(0, len(payload), 100):
        sb.table("brand_multimodal_umap").upsert(
            payload[i : i + 100], on_conflict="brand_id"
        ).execute()
    print("[done]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
