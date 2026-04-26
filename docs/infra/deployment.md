# 배포 / 인프라

> 메인 앱은 Vercel 단일 호스팅. AI 인코딩 배치는 AWS EC2 Spot 단발 spin-up→tear-down. LiteLLM 프록시는 EC2 호스팅하나 현재 OFF.

## 외부 서비스 매트릭스

| 서비스 | 용도 | 비용 모델 |
|---|---|---|
| **Vercel** | Next.js 16 호스팅 (App Router, Turbopack) | Hobby/Pro 플랜 |
| **Supabase Postgres** | 전 영속 데이터 + Auth + RLS + pgvector + pgroonga | Supabase Pro |
| **Cloudflare R2** | 이미지 저장 (분석 원본 + IG 슬라이드) | 무료 한도 + zero egress |
| **OpenAI** | GPT-4o-mini Vision/Text | 호출당 ~$0.003 (Vision, slide 1장) |
| **AWS EC2 g5.xlarge Spot** | FashionSigLIP 임베딩 배치 (단발) | $950 Activate 크레딧 활용 |
| **LiteLLM proxy (EC2, 현재 OFF)** | OpenAI 호출 라우팅·로깅·비용 통제 | EC2 인스턴스 비용 (가동 시) |
| **Instagram (oEmbed + web_profile_info)** | 포스트 스크래핑 | 무료, 비공식 |

> AI 서버 없음. Python AI 서비스(FastAPI 등) 0개. 모든 LLM 호출은 Vercel 함수에서 OpenAI(또는 LiteLLM 프록시)로 직접.

---

## Vercel — 메인 앱

| 항목 | 값 |
|---|---|
| 프레임워크 | Next.js 16 App Router (Turbopack) |
| Node | 자동 (Vercel 기본) |
| 빌드 명령 | `pnpm build` |
| 환경변수 | Project Settings 에서 등록 (`docs/infra/env.md`) |
| `vercel.json` | `{"framework": "nextjs"}` 만 — 런타임 옵션 기본값 |
| `next.config.ts` | 이미지 `remotePatterns` 화이트리스트 (R2, Cafe24, 자사몰 호스트 등) |
| 배포 트리거 | dev push → preview / main 머지 → prod |

---

## AWS EC2 Spot — 임베딩 배치

> 현재 풀배치 미실행 — 인프라/스크립트만 준비. 실행 시점은 v5 재설계 결과에 따라.

```
로컬 → ./scripts/aws/launch_embed_batch.sh
       ├─ SG/KeyPair 확인/생성
       ├─ DLAMI ID 조회
       ├─ user-data 합성 (스크립트 + 시크릿)
       └─ aws ec2 run-instances --spot
                          ↓
       EC2 g5.xlarge Spot (ap-northeast-2)
       AMI: Deep Learning AMI GPU PyTorch 2.x
       Root: 50GB gp3
       
       user-data bootstrap:
       1. pip install open_clip_torch ...
       2. embed_products.py 실행
       3. logs to /var/log/embed_products.log
       4. shutdown -h now (terminate, EBS도 같이 삭제)
                          ↓
       Supabase bulk_update_product_embeddings RPC
       → products.embedding 채워짐
```

| 항목 | 값 |
|---|---|
| 인스턴스 | g5.xlarge (A10G 24GB) |
| 마켓 | Spot (one-time, no persistence) |
| 리전 | ap-northeast-2 |
| Shutdown behavior | `terminate` — instance + EBS 자동 삭제 |
| IAM | 없음 (시크릿은 user-data 주입) |
| 보안 그룹 | `portal-embed-batch` (22/tcp from 내 IP, 디버그용) |
| Spot 가격 한도 | `--spot-options '{"MaxPrice":"0.60"}'` (시가 ~$0.40) |

### 비용 추정

| 작업 | 시간 | 비용 |
|---|---|---|
| 81k 풀 인코딩 | ~1시간 | ~$0.40 |
| 35k SAM-2 | ~1.5시간 | ~$0.60 |
| 증분 (주 1회) | ~10분 | ~$0.07 |
| 셋업 1회 + 1년 운영 | — | **~$5** (Activate 크레딧으로 사실상 무료) |

상세 사양: `docs/plans/26-04-24-aws-embedding-infra.md`

### Spot 중단 대응

중단되면 인스턴스 소멸. 로컬에서 `launch_embed_batch.sh` 재실행하면 `WHERE embedding IS NULL` 로 idempotent 필터링 → 미완료분만 처리. 재시작 오버헤드 ~3분 (부팅 + 모델 로드).

ap-northeast-2 g5.xlarge 중단 확률 ~5%. 재실행 한 번으로 복구.

---

## LiteLLM 프록시 — 현재 OFF

EC2에 호스팅된 인스턴스 존재. 현재 가동 X. v5 인프라 재설계와 함께 다시 켜질 예정.

코드는 환경변수 토글:

```ts
const useLiteLLM =
  !!process.env.LITELLM_BASE_URL &&
  process.env.LITELLM_DISABLED !== "true"
```

켜지면 OpenAI SDK base URL을 `${LITELLM_BASE_URL}/v1` 로 덮어씀. 프록시 죽으면 `LITELLM_DISABLED=true` 한 줄로 OpenAI direct 폴백.

---

## Cloudflare R2 — 이미지 저장

- `@aws-sdk/client-s3` 로 S3 API 호환 접근
- **단일 버킷**, 폴더(prefix)로 분리:
  - `analyses/<timestamp>-<uuid>-<safeName>` — `uploadImage()` 자동 prefix
  - 그 외 (예: IG 슬라이드) — 호출자가 `uploadBufferAtKey()` 로 직접 지정
- 공개 URL은 `R2_PUBLIC_URL` 한 호스트
- `next.config.ts` `remotePatterns` 에 등록 필수
- /find Vision 분석은 이미지 URL이 `R2_PUBLIC_URL` prefix인 것만 허용 (SSRF)

---

## Git 워크플로

| 항목 | 값 |
|---|---|
| 조직 | endurance-ai |
| 레포 | [endurance-ai/portal.ai](https://github.com/endurance-ai/portal.ai) (public) |
| 기본 브랜치 | `dev` |
| 흐름 | `dev` → feature branch → PR → squash merge → 머지 후 prod 배포 |

규칙:
- `git add -A` 금지 → 변경 파일만 명시적 추가 (시크릿 누락 사고 예방)
- 커밋 메시지 스타일은 `git log` 의 기존 패턴 따름
- `Co-Authored-By: Claude <noreply@anthropic.com>` 포함
- force push 금지

---

## 로컬 개발

```bash
pnpm dev          # localhost:3400
pnpm build        # Turbopack 프로덕션 빌드
pnpm lint         # ESLint
pnpm test         # vitest 1회
pnpm test:watch   # vitest watch
```

크롤/임포트/임베딩 배치는 모두 로컬에서 수동 실행. 자동 스케줄링 없음.
