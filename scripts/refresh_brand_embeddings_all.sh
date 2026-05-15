#!/usr/bin/env bash
# SPEC-BRAND-EMBED-001 cron wrapper.
#
# crawler 가 brand 분류를 추가하면 한 번에 전체 갱신:
#   1) 새 분류된 brand → multimodal 임베딩 (idempotent skip)
#   2) node centroid 재계산
#   3) adjacency 재산출 (top-K mode, --apply)
#   4) UMAP 좌표 재계산
#
# 사용:
#   ./scripts/refresh_brand_embeddings_all.sh                     # 기본 (min-members=5)
#   MIN_MEMBERS=1 ./scripts/refresh_brand_embeddings_all.sh       # 검증/스테이징용
#   ADJACENCY_MODE=threshold ADJACENCY_COSINE=0.85 \\
#     ./scripts/refresh_brand_embeddings_all.sh
#
# 첫 실행 시 패키지 캐시 ~700MB FashionSigLIP 가중치 다운로드 발생.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

MIN_MEMBERS="${MIN_MEMBERS:-5}"
ADJACENCY_MODE="${ADJACENCY_MODE:-top-k}"
ADJACENCY_K="${ADJACENCY_K:-5}"
ADJACENCY_COSINE="${ADJACENCY_COSINE:-0.85}"
ADJACENCY_PCT="${ADJACENCY_PCT:-70}"

echo "[refresh] 1/4 brand multimodal 임베딩 (idempotent)..."
uv run --with open_clip_torch --with transformers --with supabase --with httpx --with pillow --with torch \
  python scripts/embed_brand_multimodal.py

echo ""
echo "[refresh] 2/4 node_centroids 재계산 (min_members=${MIN_MEMBERS})..."
uv run --with supabase --with numpy \
  python scripts/build_node_centroids.py --min-members "${MIN_MEMBERS}"

echo ""
echo "[refresh] 3/4 style_node_adjacency 재산출 (mode=${ADJACENCY_MODE})..."
case "$ADJACENCY_MODE" in
  top-k)
    uv run --with supabase --with numpy \
      python scripts/build_adjacency_from_centroids.py \
      --mode top-k --k "${ADJACENCY_K}" --apply
    ;;
  threshold)
    uv run --with supabase --with numpy \
      python scripts/build_adjacency_from_centroids.py \
      --mode threshold --cosine "${ADJACENCY_COSINE}" --apply
    ;;
  percentile)
    uv run --with supabase --with numpy \
      python scripts/build_adjacency_from_centroids.py \
      --mode percentile --pct "${ADJACENCY_PCT}" --apply
    ;;
  dry-report)
    uv run --with supabase --with numpy \
      python scripts/build_adjacency_from_centroids.py --mode dry-report
    ;;
  *)
    echo "[fatal] unknown ADJACENCY_MODE=$ADJACENCY_MODE" >&2
    exit 1
    ;;
esac

echo ""
echo "[refresh] 4/4 brand_multimodal_umap 재계산..."
uv run --with supabase --with numpy --with umap-learn \
  python scripts/build_brand_umap.py

echo ""
echo "[refresh] 완료."
