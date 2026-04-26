#!/usr/bin/env bash
# FashionSigLIP 임베딩 배치 런처 — g5.xlarge Spot spin-up → 자동 종료
#
# 사용법:
#   ./scripts/aws/launch_embed_batch.sh            # 전체 배치
#   LIMIT=100 ./scripts/aws/launch_embed_batch.sh  # 100개만 (테스트)
#
# 사전 조건:
#   - AWS CLI + ~/.aws/credentials에 'portal-ai' 프로필
#   - .env.local에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
#   - supabase/migrations/027 적용 완료
#
# 완료는 Supabase product_embedding_coverage 뷰로 확인.
set -euo pipefail

PROFILE="portal-ai"
REGION="ap-northeast-2"
INSTANCE_TYPE="g5.xlarge"
SG_NAME="portal-embed-batch"
SPOT_MAX_PRICE="0.60"
EBS_SIZE_GB=50

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
EMBED_PY="$SCRIPT_DIR/embed_products.py"

# 1. .env.local 로드
if [ ! -f "$ROOT_DIR/.env.local" ]; then
  echo "[fatal] .env.local not found at $ROOT_DIR" >&2
  exit 1
fi
set -a; source "$ROOT_DIR/.env.local"; set +a
: "${SUPABASE_URL:?SUPABASE_URL missing in .env.local}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY missing in .env.local}"

# 2. AWS CLI / profile 확인
if ! aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1; then
  echo "[fatal] AWS profile '$PROFILE' not configured or invalid" >&2
  exit 1
fi

# 3. Python 스크립트 존재 확인
if [ ! -f "$EMBED_PY" ]; then
  echo "[fatal] $EMBED_PY not found" >&2
  exit 1
fi

# 4. 최신 Deep Learning AMI (PyTorch, Amazon Linux 2023) 조회
echo "[info] Looking up latest Deep Learning AMI in $REGION..."
DLAMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters \
    "Name=name,Values=Deep Learning OSS Nvidia Driver AMI GPU PyTorch 2.*Amazon Linux 2023*" \
    "Name=state,Values=available" \
  --query "sort_by(Images, &CreationDate)[-1].ImageId" \
  --output text \
  --profile "$PROFILE" --region "$REGION" 2>/dev/null || true)

if [ -z "$DLAMI_ID" ] || [ "$DLAMI_ID" = "None" ]; then
  echo "[fatal] Could not find Deep Learning AMI" >&2
  exit 1
fi
echo "[info] DLAMI: $DLAMI_ID"

# 5. Security Group 확인/생성 (아웃바운드만 필요)
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$SG_NAME" \
  --query "SecurityGroups[0].GroupId" --output text \
  --profile "$PROFILE" --region "$REGION" 2>/dev/null || echo "")

if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
  echo "[info] Creating security group $SG_NAME..."
  SG_ID=$(aws ec2 create-security-group \
    --group-name "$SG_NAME" \
    --description "FashionSigLIP embedding batch (outbound only)" \
    --query "GroupId" --output text \
    --profile "$PROFILE" --region "$REGION")
  echo "[info] SG $SG_ID created"
fi
echo "[info] SG: $SG_ID"

# 6. user-data 합성 (Python 스크립트 inline + 시크릿 주입)
#    외부 heredoc(EOF, unquoted): 로컬 bash가 시크릿/경로를 interpolate
#    내부 heredoc('PYEOF', quoted): EC2 bash가 Python 코드를 그대로 저장
LIMIT_LINE=""
if [ -n "${LIMIT:-}" ]; then
  LIMIT_LINE="export LIMIT='$LIMIT'"
fi

USER_DATA=$(cat <<EOF
#!/bin/bash
set -e
export SUPABASE_URL='$SUPABASE_URL'
export SUPABASE_SERVICE_ROLE_KEY='$SUPABASE_SERVICE_ROLE_KEY'
$LIMIT_LINE

# DLAMI에는 torch/CUDA 프리인스톨. 나머지만 추가.
pip3 install --no-cache-dir open_clip_torch==2.30.0 supabase==2.10.0 httpx==0.27.2 pillow

cat > /tmp/embed_products.py <<'PYEOF'
$(cat "$EMBED_PY")
PYEOF

python3 /tmp/embed_products.py 2>&1 | tee /var/log/embed_products.log
RC=\$?

if [ \$RC -ne 0 ]; then
  echo "[fatal] exit \$RC — sleeping 5 min for SSH debug then terminating"
  sleep 300
fi

shutdown -h now
EOF
)

# 7. Spot 인스턴스 기동
echo "[info] Launching $INSTANCE_TYPE Spot (max \$$SPOT_MAX_PRICE/hr)..."
RESULT=$(aws ec2 run-instances \
  --image-id "$DLAMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --security-group-ids "$SG_ID" \
  --instance-market-options "MarketType=spot,SpotOptions={MaxPrice=$SPOT_MAX_PRICE,SpotInstanceType=one-time}" \
  --block-device-mappings "[{\"DeviceName\":\"/dev/xvda\",\"Ebs\":{\"VolumeSize\":$EBS_SIZE_GB,\"VolumeType\":\"gp3\",\"DeleteOnTermination\":true}}]" \
  --instance-initiated-shutdown-behavior terminate \
  --associate-public-ip-address \
  --user-data "$USER_DATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=portal-embed-batch},{Key=Purpose,Value=fashion-siglip}]" \
  --profile "$PROFILE" --region "$REGION")

INSTANCE_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Instances'][0]['InstanceId'])")

echo ""
echo "[launched] $INSTANCE_ID"
echo ""
echo "=== 모니터링 ==="
echo "Supabase SQL Editor에서:"
echo "  SELECT * FROM product_embedding_coverage;"
echo ""
echo "인스턴스 상태:"
echo "  aws ec2 describe-instances --instance-ids $INSTANCE_ID \\"
echo "    --profile $PROFILE --region $REGION \\"
echo "    --query 'Reservations[0].Instances[0].State.Name' --output text"
echo ""
echo "수동 종료가 필요하면:"
echo "  aws ec2 terminate-instances --instance-ids $INSTANCE_ID \\"
echo "    --profile $PROFILE --region $REGION"
echo ""
echo "완료 시 자동 shutdown → terminate (EBS도 자동 삭제)."
