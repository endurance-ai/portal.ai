# GPU 배치 이미지 분석 설계

> 현재 LiteLLM → Nova Lite 경유 배치 분석 (30k 이미지, 2-3일)을  
> portal-ai AWS 계정 GPU Spot 인스턴스 + vLLM + Qwen2.5-VL-7B로 전환하여  
> **3-4시간 이내 완료**하는 것이 목표.

## 현재 상태

| 항목 | 값 |
|------|-----|
| 모델 | Nova Lite (Bedrock, ap-northeast-1) via LiteLLM |
| 서버 | portal-litellm (t4g.medium, EIP 54.116.116.225) |
| 처리량 | 0.3-0.5 req/s (adaptive token bucket, 3 concurrent) |
| 30k 소요 | 2-3일 |
| 비용 | ~$6 (토큰 비용) + EC2 ~$15/월 |
| 병목 | API rate limit (Bedrock throttling) |

## 목표

| 항목 | 목표 |
|------|------|
| 처리량 | 10+ req/s |
| 30k 소요 | 3-4시간 |
| 비용 | < $10 (Spot 기준) |
| 코드 변경 | 최소 (endpoint + concurrency 변경 수준) |
| 프롬프트/스키마 | 현행 유지 (v1) |

## 아키텍처

```
┌─ 로컬 (batch script) ─────────────────────────┐
│  npx tsx scripts/analyze-products.ts            │
│  --version v1 --concurrency 16                  │
│                                                 │
│  LITELLM_BASE_URL=http://<gpu-private-ip>:8000  │
│  (vLLM OpenAI-compatible endpoint 직접 호출)    │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────▼────────────────┐
        │  EC2 GPU Spot Instance      │
        │  g5.xlarge (A10G 24GB)      │
        │  ap-northeast-2             │
        │                             │
        │  vLLM Server                │
        │  ├─ Model: Qwen2.5-VL-7B   │
        │  ├─ Port: 8000              │
        │  ├─ --max-model-len 4096    │
        │  └─ --gpu-memory-utilization│
        │     0.90                    │
        └─────────────────────────────┘
```

### LiteLLM 경유 vs vLLM 직접 호출

vLLM이 OpenAI-compatible API를 제공하므로, **LiteLLM을 경유하지 않고 vLLM 직접 호출**한다.

이유:
- 배치 전용이라 라우팅/폴백 불필요
- LiteLLM 경유 시 불필요한 네트워크 홉 + 오버헤드
- 기존 `product-analyzer.ts`의 OpenAI SDK 클라이언트가 그대로 호환

변경:
```diff
- LITELLM_BASE_URL=http://54.116.116.225:4000
+ LITELLM_BASE_URL=http://<gpu-private-ip>:8000
- LITELLM_MODEL=nova-lite
+ LITELLM_MODEL=Qwen/Qwen2.5-VL-7B-Instruct
```

## GPU 인스턴스 설계

### 인스턴스 선택

| 후보 | GPU | VRAM | 시간당 (OD) | 시간당 (Spot) | 비고 |
|------|-----|------|------------|-------------|------|
| **g5.xlarge** | A10G | 24GB | $1.29 | ~$0.40 | Qwen2.5-VL-7B FP16 (16GB) 여유 있음 |
| g4dn.xlarge | T4 | 16GB | $0.71 | ~$0.21 | FP16 빡빡함, Q8 필요 |
| g6.xlarge | L4 | 24GB | $1.05 | ~$0.32 | A10G와 유사, 리전별 가용성 확인 필요 |

**선택: g5.xlarge (Spot)**
- Qwen2.5-VL-7B FP16이 16GB → 24GB VRAM에 여유 있게 수용
- 옵티젠 GPU 인프라 경험 활용 가능 (vLLM 세팅 동일)
- Spot 중단 시 기존 스크립트의 skip-already-analyzed 로직으로 이어서 실행

### AMI 선택

```
Deep Learning AMI GPU PyTorch 2.x (Amazon Linux 2023)
- CUDA, PyTorch, Python 3.11+ 프리인스톨
- vLLM: pip install vllm 으로 추가 설치 (~5분)
```

옵티젠처럼 커스텀 AMI를 만들 수도 있지만, 일회성이라 DLAMI + pip install이 더 빠름.

### 네트워크

portal-ai 계정은 default VPC 사용 중.

| 항목 | 설정 |
|------|------|
| VPC | default VPC (ap-northeast-2) |
| Subnet | 퍼블릭 서브넷 (배치 스크립트가 로컬에서 접근) |
| Security Group | 신규 생성: `portal-gpu-batch` |
| SG 인바운드 | 8000/TCP from 내 IP (vLLM API) + 22/TCP from 내 IP (SSH) |
| EIP | 불필요 (퍼블릭 IP 자동 할당, 일회성) |

### 스토리지

| 항목 | 설정 |
|------|------|
| Root EBS | 100GB gp3 (OS + vLLM + 모델 ~15GB) |
| 모델 로드 | HuggingFace Hub에서 직접 다운로드 (S3 패턴은 일회성이라 불필요) |

## 스크립트 변경

### analyze-products.ts 수정사항

1. **Token bucket 비활성화** (rate limit 없으므로)
2. **Concurrency 올리기** (3 → 16)
3. **환경변수만 변경** (endpoint + model)

```typescript
// 변경 1: token bucket bypass 옵션 추가
const DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT === "true";

// acquireToken() 내부:
if (DISABLE_RATE_LIMIT) {
  return; // 즉시 반환, 대기 없음
}

// 변경 2: concurrency 기본값 조정 (또는 CLI flag 사용)
// --concurrency 16 으로 실행
```

### 실행 명령

```bash
# 환경변수 세팅
export LITELLM_BASE_URL=http://<gpu-public-ip>:8000
export LITELLM_MODEL=Qwen/Qwen2.5-VL-7B-Instruct
export LITELLM_API_KEY=dummy  # vLLM은 인증 불필요
export DISABLE_RATE_LIMIT=true

# 배치 실행
npx tsx scripts/analyze-products.ts \
  --version v1 \
  --concurrency 16
```

### 주의: Qwen2.5-VL 이미지 입력 방식

현재 스크립트는 `image_url`에 **외부 URL을 직접 전달**:
```typescript
{ type: "image_url", image_url: { url: imageUrl } }
```

vLLM의 Qwen2.5-VL 지원에서 외부 URL 직접 로드가 되는지 확인 필요.
- vLLM은 기본적으로 URL fetch를 지원하지만, 일부 모델에서 이슈 있을 수 있음
- 안 되면: base64 인코딩으로 전환 필요 (이미지 다운로드 → base64 → data URI)
- 이 부분은 실제 테스트 시 확인

## 실행 계획

### Step 1: GPU 인스턴스 생성 (~10분)

```bash
# 1. Security Group 생성
aws ec2 create-security-group \
  --group-name portal-gpu-batch \
  --description "GPU batch analysis" \
  --profile portal-ai --region ap-northeast-2

# 2. 인바운드 규칙 추가 (내 IP)
aws ec2 authorize-security-group-ingress \
  --group-name portal-gpu-batch \
  --protocol tcp --port 8000 --cidr <MY_IP>/32

aws ec2 authorize-security-group-ingress \
  --group-name portal-gpu-batch \
  --protocol tcp --port 22 --cidr <MY_IP>/32

# 3. Spot Instance 요청
aws ec2 run-instances \
  --image-id <DLAMI_ID> \
  --instance-type g5.xlarge \
  --key-name portal-key \
  --security-group-ids <SG_ID> \
  --instance-market-options '{"MarketType":"spot"}' \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":100,"VolumeType":"gp3"}}]' \
  --associate-public-ip-address \
  --region ap-northeast-2 --profile portal-ai
```

### Step 2: vLLM 설치 + 모델 로드 (~20-30분)

```bash
ssh -i ~/.ssh/portal-key.pem ec2-user@<PUBLIC_IP>

# vLLM 설치
pip install vllm

# vLLM 서버 시작 (Qwen2.5-VL-7B, 모델 자동 다운로드)
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-VL-7B-Instruct \
  --port 8000 \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.90 \
  --trust-remote-code
```

### Step 3: 배치 실행 (~3-4시간)

```bash
# 로컬에서 실행
LITELLM_BASE_URL=http://<GPU_IP>:8000 \
LITELLM_MODEL=Qwen/Qwen2.5-VL-7B-Instruct \
LITELLM_API_KEY=dummy \
DISABLE_RATE_LIMIT=true \
npx tsx scripts/analyze-products.ts --version v1 --concurrency 16
```

### Step 4: 검증 + 인스턴스 종료

```bash
# 결과 확인 (Supabase에서)
# 분석 완료 수, 실패 수, 샘플 검토

# GPU 인스턴스 종료
aws ec2 terminate-instances \
  --instance-ids <INSTANCE_ID> \
  --profile portal-ai --region ap-northeast-2
```

## 리스크 & 대응

| 리스크 | 확률 | 대응 |
|--------|------|------|
| Spot 중단 | Medium | 스크립트가 이미 분석된 건 skip → 새 Spot 띄워서 이어서 실행 |
| Qwen2.5-VL JSON 파싱 실패 | Low~Medium | 기존 validateAndNormalize()가 처리. 실패율 높으면 temperature 조정 |
| 이미지 URL 로드 실패 | Low | vLLM URL fetch 안 되면 base64 변환 로직 추가 |
| g5.xlarge Spot 용량 부족 | Low | g6.xlarge 또는 g4dn.xlarge로 폴백 |
| 모델 품질 차이 | Medium | 먼저 100개 샘플로 Nova Lite vs Qwen2.5-VL 비교 테스트 |

## Spot 중단 대응 상세

기존 `analyze-products.ts`에 이미 있는 로직:
1. 실행 시 기존 분석 결과 조회 → 이미 성공한 product_id skip
2. `--retry-failed` 플래그로 실패건만 재시도

따라서 Spot 중단 시:
1. 새 Spot 인스턴스 요청
2. 동일 명령으로 다시 실행 → 자동으로 미완료분만 처리

## 검증 계획

### 사전 테스트 (100개 샘플)

배치 전체를 돌리기 전에 100개 상품으로 테스트:

```bash
npx tsx scripts/analyze-products.ts \
  --version v1-test \
  --limit 100 \
  --concurrency 8
```

확인 항목:
- [ ] JSON 파싱 성공률 (목표: 95%+)
- [ ] enum validation 통과률
- [ ] 이미지 URL 로드 성공
- [ ] 평균 응답 시간 / throughput
- [ ] Nova Lite 결과와 비교 (카테고리, 색상 일치율)

### 전체 배치 후

- [ ] 총 성공/실패 수
- [ ] 기존 eval-prompt.ts로 품질 비교
- [ ] 검색 엔진에서 실제 쿼리 테스트

## NOT in scope

- 프롬프트 변경 (현행 analyze-prompt.ts 유지)
- 스키마 변경 (product_ai_analysis 테이블 유지)
- 검색 엔진 로직 변경
- version 업그레이드 (v1 유지, 프롬프트 동일하므로)
- 상시 GPU 서빙 인프라
- AI 서버 (FastAPI) 구축
