"""SPEC-BRAND-EMBED-001 P4: style_node_adjacency 자동 채움.

node_centroids 의 모든 pair cosine 계산 → 선택된 mode 로 필터 → INSERT.

Manual override 보호:
  source='manual' edge 는 절대 건드리지 않음.
  source='embedding_derived' edge 만 DELETE 후 재삽입.

대칭성:
  from_id < to_id 인 pair 계산 후 양쪽 (from→to, to→from) 모두 저장.

Modes:
  - dry-report (기본): 분포 통계만 출력, DB 변경 없음. 데이터 보고 threshold 결정용.
  - threshold:   weight >= --cosine 인 pair 만 edge
  - top-k:       각 node 의 가장 가까운 K node 만 edge (그래프 차수 보장)
  - percentile:  상위 P% pair 만 edge

사용:
    # 1) 데이터 분포 확인 (안전, 기본)
    uv run --with supabase --with numpy python scripts/build_adjacency_from_centroids.py

    # 2) threshold 모드로 채움
    uv run python scripts/build_adjacency_from_centroids.py \\
        --mode threshold --cosine 0.85 --apply

    # 3) top-K 모드
    uv run python scripts/build_adjacency_from_centroids.py \\
        --mode top-k --k 5 --apply

    # 4) percentile 모드
    uv run python scripts/build_adjacency_from_centroids.py \\
        --mode percentile --pct 70 --apply
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
    parser.add_argument(
        "--mode",
        choices=["dry-report", "threshold", "top-k", "percentile"],
        default="dry-report",
        help="edge 선택 방식 (기본 dry-report: 통계만 출력)",
    )
    parser.add_argument("--cosine", type=float, default=0.85, help="mode=threshold cutoff")
    parser.add_argument("--k", type=int, default=5, help="mode=top-k 의 K")
    parser.add_argument("--pct", type=int, default=70, help="mode=percentile (상위 N퍼센트)")
    parser.add_argument("--apply", action="store_true", help="DB 변경 실행 (없으면 plan 만 출력)")
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

    # ─── 1) centroid 로드 ────────────────────────────────────
    print("[1/4] node_centroids 로드...")
    rows = (
        sb.table("node_centroids")
        .select("style_node_id, vector, member_count, style_nodes(code,name_en)")
        .execute()
        .data
        or []
    )
    if len(rows) < 2:
        print(f"[done] centroid {len(rows)}개 < 2 — adjacency 계산 불가")
        return 0

    ids = [r["style_node_id"] for r in rows]
    members = {r["style_node_id"]: r["member_count"] for r in rows}
    labels = {r["style_node_id"]: (r["style_nodes"]["code"], r["style_nodes"]["name_en"]) for r in rows}
    mat = np.stack([np.asarray(parse_vector(r["vector"]), dtype=np.float32) for r in rows])
    # L2-normalize 보정 (이미 normalize 됐어야 하지만 안전)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    mat = mat / np.maximum(norms, 1e-12)
    sim = mat @ mat.T  # (N, N) cosine
    np.fill_diagonal(sim, -1.0)

    # ─── 2) pair 분포 통계 ───────────────────────────────────
    n = len(ids)
    triu_mask = np.triu(np.ones((n, n), dtype=bool), k=1)
    pair_scores = sim[triu_mask]
    print(f"[2/4] {n}개 centroid → {len(pair_scores)} unordered pair")
    print(f"     cosine min={pair_scores.min():.4f} median={np.median(pair_scores):.4f} "
          f"max={pair_scores.max():.4f}")
    print(f"     percentiles 50/70/85/95: "
          f"{np.percentile(pair_scores, 50):.4f} / "
          f"{np.percentile(pair_scores, 70):.4f} / "
          f"{np.percentile(pair_scores, 85):.4f} / "
          f"{np.percentile(pair_scores, 95):.4f}")
    print(f"     member_count 분포 (min/median/max): "
          f"{min(members.values())} / {int(np.median(list(members.values())))} / "
          f"{max(members.values())}")

    # ─── 3) mode 별 edge 선택 ────────────────────────────────
    if args.mode == "dry-report":
        print("[3/4] mode=dry-report — 통계만 출력하고 종료")
        # top-15 pair 도 같이 보여줘서 sanity check
        flat = []
        for i in range(n):
            for j in range(i + 1, n):
                flat.append((sim[i, j], ids[i], ids[j]))
        flat.sort(reverse=True)
        print("     === top 15 pairs ===")
        for s, a, b in flat[:15]:
            ca, na = labels[a]
            cb, nb = labels[b]
            print(f"       {ca} ({na}) ↔ {cb} ({nb})  cos={s:.4f} "
                  f"[members {members[a]}/{members[b]}]")
        return 0

    edges: list[tuple[int, int, float]] = []  # (from_id, to_id, weight)

    if args.mode == "threshold":
        for i in range(n):
            for j in range(i + 1, n):
                if sim[i, j] >= args.cosine:
                    edges.append((ids[i], ids[j], float(sim[i, j])))
                    edges.append((ids[j], ids[i], float(sim[i, j])))
        print(f"[3/4] mode=threshold cosine>={args.cosine} → {len(edges)//2} unordered → {len(edges)} directed")

    elif args.mode == "top-k":
        for i in range(n):
            row = sim[i].copy()
            top = np.argsort(-row)[: args.k]
            for j in top:
                if i == j or row[j] <= 0:
                    continue
                edges.append((ids[i], ids[j], float(row[j])))
        # symmetric 보장: (a→b) 있으면 (b→a) 도 — 단 dedup 필요
        edges = list({(a, b): w for a, b, w in edges}.items())
        edges_sym = []
        seen = set()
        for (a, b), w in edges:
            seen.add((a, b))
            edges_sym.append((a, b, w))
        for (a, b), w in edges:
            if (b, a) not in seen:
                edges_sym.append((b, a, w))
                seen.add((b, a))
        edges = edges_sym
        print(f"[3/4] mode=top-k k={args.k} → {len(edges)} directed (대칭화 후)")

    elif args.mode == "percentile":
        cutoff = float(np.percentile(pair_scores, args.pct))
        for i in range(n):
            for j in range(i + 1, n):
                if sim[i, j] >= cutoff:
                    edges.append((ids[i], ids[j], float(sim[i, j])))
                    edges.append((ids[j], ids[i], float(sim[i, j])))
        print(f"[3/4] mode=percentile pct={args.pct} → cutoff={cutoff:.4f} → {len(edges)} directed")

    if not edges:
        print("[done] 선택된 edge 없음")
        return 0

    # ─── 4) DB 반영 ─────────────────────────────────────────
    if not args.apply:
        print("[4/4] --apply 미지정 — plan 출력 후 종료 (DB 변경 없음)")
        print("     === edge plan sample (first 20) ===")
        for a, b, w in edges[:20]:
            ca, _ = labels[a]
            cb, _ = labels[b]
            print(f"       {ca}->{cb}  w={w:.4f}")
        if len(edges) > 20:
            print(f"       ... +{len(edges) - 20} more")
        return 0

    print(f"[4/4] --apply ✓ — source='embedding_derived' edge 갱신 ({len(edges)} directed)...")
    # 기존 embedding_derived edge 만 삭제 (manual 보존)
    sb.table("style_node_adjacency").delete().eq("source", "embedding_derived").execute()
    # weight 는 numeric(3,2) → 0~1 범위로 clamp + 소수 2자리
    insert_rows = [
        {
            "from_id": a,
            "to_id": b,
            "weight": round(max(0.0, min(1.0, w)), 2),
            "source": "embedding_derived",
        }
        for a, b, w in edges
    ]
    # batch insert (PostgREST 는 list 직접 받음)
    for i in range(0, len(insert_rows), 100):
        chunk = insert_rows[i : i + 100]
        sb.table("style_node_adjacency").insert(chunk).execute()
    print("[done]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
