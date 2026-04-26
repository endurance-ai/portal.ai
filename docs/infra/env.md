# 환경 변수

> `.env.local` 에 들어가는 전체 키 + Vercel/AWS 측 자격증명. 코드 grep 기반 실측.

## 필수

| 키 | 용도 | 노출 |
|---|---|---|
| `OPENAI_API_KEY` | GPT-4o-mini Vision/Text | 서버 전용 |
| `SUPABASE_URL` | service role 접근용 URL | 서버 전용 |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 바이패스 (DB 쓰기/관리) | 서버 전용 |
| `NEXT_PUBLIC_SUPABASE_URL` | 어드민 Auth (브라우저) | 클라이언트 OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 어드민 Auth (브라우저) | 클라이언트 OK |
| `R2_ACCOUNT_ID` | Cloudflare R2 endpoint 합성용 | 서버 전용 |
| `R2_ACCESS_KEY_ID` | R2 S3-compat key | 서버 전용 |
| `R2_SECRET_ACCESS_KEY` | R2 S3-compat secret | 서버 전용 |
| `R2_BUCKET_NAME` | 단일 버킷 이름 | 서버 전용 |
| `R2_PUBLIC_URL` | R2 public CDN prefix | 서버 전용 (Vision SSRF 가드 기준) |

## 선택 (opt-in)

| 키 | 용도 | 기본 동작 |
|---|---|---|
| `APIFY_TOKEN` | Instagram post 스크래핑 (`apify/instagram-post-scraper` actor) | 미설정 시 fetch-post 실패 — 메인 플로우 v2 진입점에서 필수가 될 예정 |
| `LITELLM_BASE_URL` | LiteLLM 프록시 base URL | 미설정 시 OpenAI 직접 호출 |
| `LITELLM_API_KEY` | 프록시 인증 | OPENAI_API_KEY로 폴백 |
| `LITELLM_MODEL` | 프록시 모델 명시 | (현재 코드는 항상 `gpt-4o-mini`) |
| `LITELLM_DISABLED` | `true` 로 두면 즉시 OpenAI direct 폴백 | 프록시 죽었을 때 비상 스위치 |
| `AI_SERVER_URL` | portal-ai-server (FastAPI) base URL — `/api/find/search`가 v5 검색을 위해 호출 | 미설정 시 v4 in-process 폴백으로 자동 전환 |
| `AI_SERVER_TIMEOUT_MS` | AI 서버 호출 타임아웃 (ms) | 기본 8000 |
| `PROXY_HOST` / `PROXY_PORT` / `PROXY_USER` / `PROXY_PASS` | Instagram 스크래퍼 undici ProxyAgent | 미설정 시 직접 연결 |
| `LOG_LEVEL` | pino 로그 레벨 | 기본 `info` |
| `EVAL_BASE_URL` | 평가 스크립트 (`scripts/eval-*.ts`) 의 타깃 URL | — |

## 자동/시스템

| 키 | 출처 |
|---|---|
| `NODE_ENV` | Next.js 자동 |
| `NEXT_PUBLIC_*` | Vercel 빌드타임 인라인 |

---

## AWS 자격증명

`scripts/aws/launch_embed_batch.sh` 가 사용. `.env.local` 이 아닌 `~/.aws/credentials` 의 프로필을 읽음.

| 프로필 | 용도 | 리전 |
|---|---|---|
| `portal-ai` | EC2 Spot 기동 (FashionSigLIP 임베딩 배치) | `ap-northeast-2` |

배치 실행 전 사전 조건:
1. `~/.aws/credentials` 에 `portal-ai` 프로필
2. EC2 key pair `portal-key` (디버그 SSH용, 없으면 스크립트가 생성 제안)
3. `.env.local` 에 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (user-data로 EC2에 주입됨)

---

## prod (Vercel) 차이

- 모든 위 키는 Vercel Project Settings → Environment Variables 에 동일하게 등록
- `NEXT_PUBLIC_*` 만 빌드타임 인라인 → Production / Preview / Development 모두 명시 필요
- LiteLLM 관련은 현재 prod에도 미설정 (OFF 상태) — v5 인프라 재설계와 함께 켤 때 같이 등록

---

## 시크릿 노출 체크

- 서비스 롤 키 / OpenAI 키는 절대 클라이언트 노출 금지
- `src/lib/supabase.ts`, `src/lib/r2.ts`, `src/lib/admin-auth.ts` 모두 `import "server-only"` 로 가드
- middleware는 `NEXT_PUBLIC_*` 만 사용 (anon key + 쿠키)
- 로컬 `.env.local` 은 `.gitignore` — 절대 커밋 금지
