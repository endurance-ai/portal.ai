"""SPEC-BRAND-EMBED-001 P3: style_node centroid 계산.

같은 primary_style_node_id 의 brand_multimodal_embeddings.vector 들을
평균 → L2-normalize → node_centroids UPSERT.

stale-or-fresh idempotent: 매 실행마다 모든 active node 의 centroid 를
재계산. 멤버가 줄거나 늘면 자동 반영.

사용:
    uv run --with supabase --with numpy python scripts/build_node_centroids.py
    # 검증용 (현재 brand 분포가 적을 때)
    uv run python scripts/build_node_centroids.py --min-members 1
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Optional


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
    parser.add_argument(
        "--min-members",
        type=int,
        default=5,
        help="centroid 만들 최소 brand 수 (SPEC §3 기본 5, 검증용 1)",
    )
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
    from supabase import create_client

    sb = create_client(db_url, db_token)

    # ─── 1) brand vector + node 매핑 로드 ─────────────────
    print("[1/3] brand vectors + node 매핑 로드 중...")
    rows = (
        sb.table("brand_multimodal_embeddings")
        .select("brand_id, vector, embedding_model, brand_nodes(primary_style_node_id)")
        .execute()
        .data
        or []
    )
    print(f"     {len(rows)} brand vector")

    # group by primary_style_node_id
    groups: dict[int, dict] = {}
    model_seen: Optional[str] = None
    for r in rows:
        bn = r.get("brand_nodes") or {}
        sid = bn.get("primary_style_node_id")
        if sid is None:
            continue
        vec = np.asarray(parse_vector(r["vector"]), dtype=np.float32)
        g = groups.setdefault(sid, {"vectors": [], "brand_ids": []})
        g["vectors"].append(vec)
        g["brand_ids"].append(r["brand_id"])
        if model_seen is None:
            model_seen = r.get("embedding_model")

    if not groups:
        print("[done] 분류된 brand vector 없음")
        return 0

    # ─── 2) centroid 계산 ──────────────────────────────
    print(f"[2/3] {len(groups)} node centroid 계산 (min_members={args.min_members})...")
    upserts: list[dict] = []
    for sid, g in sorted(groups.items()):
        n = len(g["vectors"])
        if n < args.min_members:
            print(f"     [skip] node_id={sid} members={n} < {args.min_members}")
            continue
        stack = np.stack(g["vectors"])
        mean = stack.mean(axis=0)
        norm = float(np.linalg.norm(mean))
        if norm < 1e-9:
            print(f"     [skip] node_id={sid} mean norm ~0", file=sys.stderr)
            continue
        centroid = mean / norm
        upserts.append({
            "style_node_id": sid,
            "vector": "[" + ",".join(f"{x:.6f}" for x in centroid.tolist()) + "]",
            "member_count": n,
            "embedding_model": model_seen,
        })
        print(f"     [ok]   node_id={sid} members={n}")

    if args.dry_run:
        print(f"[3/3] DRY RUN — {len(upserts)} centroid 미적용")
        return 0

    # ─── 3) UPSERT ───────────────────────────────────
    print(f"[3/3] UPSERT {len(upserts)} centroid...")
    for row in upserts:
        # PostgREST 가 updated_at default 트리거하도록 명시적으로 보내지 않음
        sb.table("node_centroids").upsert(row, on_conflict="style_node_id").execute()

    # 멤버 미달이라 삭제 대상이면 cleanup — 본 PR 에서는 보수적으로 유지.
    # (향후 build_node_centroids.py 의 --prune 옵션 추가 가능)
    print("[done]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
