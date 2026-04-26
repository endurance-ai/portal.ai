# FashionSigLIP 임베딩 — AWS EC2 Spot 인프라 스펙

**작성일**: 2026-04-24
**상위 문서**: `docs/plans/26-04-23-embedding-rewrite-plan.md`
**참조**: `docs/superpowers/specs/2026-04-10-gpu-batch-analysis-design.md` (기존 vLLM/Qwen 배치용 — 인프라 패턴 재사용)

## 목적

v5 검색 엔진용 FashionSigLIP 이미지 임베딩을 **AWS EC2 g5.xlarge Spot**에서 spin-up → 배치 처리 → self-terminate 패턴으로 생성한다. 운영 비용 최소화 + $950 Activate 크레딧 활용.

## 워크로드 분리

| 레이어 | 주기 | 인프라 | 비용 |
|---|---|---|---|
| 초기 배치 (81k) | 1회 | g5.xlarge Spot, ~1시간 | ~$0.40 |
| 증분 배치 (신규 크롤) | 주 1회 | g5.xlarge Spot, ~10분 | ~$0.07 |
| SAM-2 배치 (35k) | 1회 | g5.xlarge Spot, ~1.5시간 | ~$0.60 |
| **쿼리 시점 (서빙)** | 유저 요청마다 | **CPU text embedding (별도 결정)** | ~$0 |

쿼리 시점 세부는 배치 완료 후 결정 (옵션: Vercel 함수 with transformers.js / 초경량 EC2 with FastAPI).

## 아키텍처

```
┌─ 로컬 ──────────────────────────────────┐
│  ./scripts/aws/launch_embed_batch.sh    │
│  ├─ SG/KeyPair 확인/생성                │
│  ├─ DLAMI ID 조회                       │
│  ├─ user-data 합성 (스크립트 + 시크릿) │
│  └─ aws ec2 run-instances --spot        │
└────────────────┬────────────────────────┘
                 │
        ┌────────▼─────────────────────────┐
        │  EC2 g5.xlarge Spot (ap-northeast-2)│
        │  AMI: Deep Learning AMI GPU PyTorch│
        │                                    │
        │  user-data bootstrap:              │
        │  1. pip install open_clip_torch ...│
        │  2. save embed_products.py         │
        │  3. run script (logs stdout)       │
        │  4. shutdown -h now (terminate)    │
        └──────────┬─────────────────────────┘
                   │
         ┌─────────▼──────────┐
         │  Supabase          │
         │  bulk RPC          │
         │  products.embedding│
         └────────────────────┘
```

## 인프라 설계

### 인스턴스

| 항목 | 값 |
|---|---|
| 타입 | g5.xlarge (A10G 24GB) |
| 마켓 | **Spot** (one-time, no persistence) |
| 리전 | ap-northeast-2 |
| AMI | Deep Learning AMI GPU PyTorch 2.x (Amazon Linux 2023) — 최신 버전 CLI로 조회 |
| Root EBS | 50GB gp3 (OS + open_clip 모델 ~1GB + 워킹 스페이스) |
| Shutdown behavior | **terminate** (shutdown → instance 삭제, EBS도 삭제) |
| IAM | 없음 (시크릿은 user-data로 주입) |

### 네트워크

| 항목 | 값 |
|---|---|
| VPC | default |
| Subnet | public (auto-assign public IP) |
| Security Group | `portal-embed-batch` (신규) |
| SG 인바운드 | `22/tcp` from 내 IP (디버그 SSH용, 선택) |
| SG 아웃바운드 | all (Supabase/HuggingFace/CDN fetch) |

### 스크립트 파일

| 파일 | 역할 |
|---|---|
| `scripts/aws/embed_products.py` | EC2에서 실행. Supabase 페이지네이션, ThreadPool 병렬 이미지 다운로드(20 워커), GPU 배치 인코딩, bulk RPC upsert. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LIMIT`(선택) |
| `scripts/aws/launch_embed_batch.sh` | 로컬에서 실행. `.env.local` 로드 → SG/키 확인 → user-data 합성 → Spot 인스턴스 기동 |

## Self-terminate 패턴

user-data 끝에 항상 shutdown. 크래시해도 5분 후 강제 종료(비용 leak 방지 + 디버그 창).

```bash
#!/bin/bash
set -e
export SUPABASE_URL='...'
export SUPABASE_SERVICE_ROLE_KEY='...'

# DLAMI에 torch 있음. 나머지만 설치.
/opt/pytorch/bin/pip install --no-cache-dir open_clip_torch==2.30.0 supabase==2.10.0 httpx==0.27.2

cat > /tmp/embed_products.py <<'PYEOF'
<standalone Python script>
PYEOF

/opt/pytorch/bin/python /tmp/embed_products.py 2>&1 | tee /var/log/embed_products.log
RC=$?

if [ $RC -ne 0 ]; then
  echo "Exit $RC — sleeping 5 min for SSH debug"
  sleep 300
fi

shutdown -h now
```

## 진행 모니터링

별도 SSH/CloudWatch 불필요. Supabase에서 확인:

```sql
SELECT * FROM product_embedding_coverage;
-- pct_embedded 컬럼이 실시간으로 증가
```

완료 기준: 모든 플랫폼 pct_embedded ≥ 99% (일부는 이미지 fetch 실패로 skip될 수 있음).

## Spot 중단 대응

Spot이 중단되면 인스턴스 소멸. 로컬에서 `launch_embed_batch.sh` 재실행하면:
- `WHERE embedding IS NULL`로 idempotent 필터링 → 미완료분만 처리
- 재시작 오버헤드 ~3분 (부팅 + 모델 로드)

중단 확률 ap-northeast-2 g5.xlarge 기준 ~5%. 실패해도 재실행 한 번으로 복구.

## 비용 안전장치

- Spot 한도: `--spot-options '{"MaxPrice":"0.60"}'` (Spot 시가 $0.40 + 여유) — 시가 폭등 시 새로 요청 실패
- Shutdown behavior terminate: instance 삭제 시 EBS 자동 삭제 (고아 볼륨 없음)
- 최대 비용 상한: 실수로 8시간 방치해도 $3.2. 크레딧 $950 대비 무시 가능

## 사전 조건

1. `~/.aws/credentials`에 `portal-ai` 프로필
2. `.env.local`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
3. EC2 key pair `portal-key` (ap-northeast-2) — 디버그 SSH용, 없으면 스크립트가 생성 제안

## NOT in scope

- 상시 GPU 서빙 인프라
- AI 서버 (FastAPI 추론 엔드포인트)
- 자동 주기 배치 (EventBridge + Lambda 트리거) — 초기엔 수동 실행
- CloudWatch Logs agent — stdout 로그로 충분
- ASG / Launch Template — 단발성이라 불필요
