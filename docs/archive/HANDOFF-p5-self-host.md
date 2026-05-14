# P5 Self-Host 마이그 HANDOFF

**SPEC**: `/Users/hansangho/Desktop/aws-infra/.moai/specs/SPEC-INFRA-MIGRATE-001/spec.md` (P5 단계)
**작성**: 2026-05-07 (aws-infra 세션에서 이어받음)
**예상 시간**: 2~3 시간 (단일 세션)

---

## 1. 배경 — 이미 끝난 것

**aws-infra 측 (DONE)**
- ✅ dev-app EC2 (`i-033e3d2edcdeaa8c6`, 54.116.104.193 / private 172.31.59.31, t4g.large, AZ 2d)
- ✅ Postgres 16.13 + pgvector 0.8.2 + pgroonga 4.0.6 컨테이너 `db` healthy (port 127.0.0.1:5432, project=portal-dev)
- ✅ Supabase → dev-app 데이터 마이그 완료 (23 테이블, products 78,785 row, 269 함수 — RPC `search_products_v5`/`bulk_update_product_embeddings`/`set_hnsw_ef_search`/`get_product_filter_counts` 포함)
- ✅ DB user 3종: `app_user` (RW), `ai_user` (R+RPC), `backup_user` (read-all). password 는 dev-app 의 `~/kikoai-app/env/.env` 에 있음
- ✅ S3 백업 cron (매일 19:00 UTC, `kiko-ai-pg-backups/dev-app/`)

**kikoai/app 측 (이번 세션 일부 끝남, DONE)**
- ✅ `Dockerfile` (multi-stage, node:22-alpine, pnpm 10.23.0, standalone build)
- ✅ `.dockerignore`
- ✅ `.github/workflows/deploy-dev.yml` (GHA, ECR_REPOSITORY=`kikoai-dev/app`, dev branch PR merge trigger)
- ✅ `next.config.ts`: `output: "standalone"` 추가
- ⏸️ commit + push 미완 — 새 세션 첫 단계로

**ECR/IAM (DONE — kiko.ai 프로필)**
- ECR: `kikoai-dev/app` 신규
- IAM user: `kikoai-dev-gha` (이전 portal-ai-gha 에서 rename, **access key 동일** — kikoai/ai 와 같은 secrets 재사용 가능)
- IAM 정책: `EcrPushPortalDev` (kikoai-dev/* + portal/dev/* push 가능)

---

## 2. 새 세션 첫 단계 — 사용자 작업 (~5분)

```bash
cd /Users/hansangho/Desktop/kikoai/app

# (1) 변경분 commit + push
git add Dockerfile .dockerignore .github/workflows/deploy-dev.yml next.config.ts HANDOFF-p5-self-host.md
git commit -m "feat: SPEC-INFRA-MIGRATE-001 P5 — Vercel→EC2 self-host 인프라"
git push origin <feature-branch>   # PR 은 dev branch 로

# (2) GHA secrets 등록 (gh CLI)
gh secret set AWS_ACCESS_KEY_ID                         # kikoai/ai 와 동일
gh secret set AWS_SECRET_ACCESS_KEY                     # kikoai/ai 와 동일
gh secret set SSH_HOST    --body "54.116.104.193"
gh secret set SSH_USER    --body "ec2-user"
gh secret set SSH_PRIVATE_KEY < ~/Desktop/aws-infra/portal-ai-key.pem

# (3) GitHub Environment 'dev' 생성 — Settings → Environments → New: dev
```

---

## 3. P5 코드 마이그 — 체크리스트

### A. /api/health endpoint (필수, 5분)

**왜**: GHA 의 SSH deploy 후 `deploy.app.sh` 가 `curl http://localhost:80/api/health` 로 검증. 200 안 나오면 deploy fail.

**파일**: `app/api/health/route.ts` (신규)

```typescript
import { NextResponse } from "next/server"

export async function GET() {
  // dev 단계: Postgres 연결 체크 X (간단). 운영 단계 진입 시 DATABASE_URL 핑 추가
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() })
}
```

### B. DB 클라이언트 — ORM 선택 (필수, 30분)

**현재**: `@supabase/supabase-js` 가 SUPABASE_URL + SERVICE_ROLE_KEY 로 REST API 사용
**전환**: DATABASE_URL = `postgresql://app_user:<PASSWORD>@db:5432/kikoai?sslmode=require`

**ORM 추천: Drizzle**
- 이유: TypeScript 우선, 가벼움, raw SQL 도 자연스러움 (RPC 호출 편함)
- 대안: Kysely (더 가볍지만 type 정의 수동), Prisma (무거움 — 추천 X)

```bash
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg
```

**파일**: `src/lib/db.ts` (신규)

```typescript
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },  // 자체서명 cert
})

export const db = drizzle(pool)
```

**RPC 호출 예시** (`search_products_v5` 같은 PostgreSQL function):

```typescript
import { sql } from "drizzle-orm"

const result = await db.execute(sql`SELECT * FROM search_products_v5(${embedding}::vector, ${limit}, ${threshold})`)
```

### C. Auth.js Credentials Provider 교체 (필수, 1~2시간)

**현재**: `@supabase/ssr` + `@supabase/supabase-js` 로 admin 인증 (cookies + JWT 검증)
**전환**: Auth.js v5 (`next-auth@beta`) + Credentials + bcrypt

**1) DB schema 변경**: `admin_profiles` 에 `password_hash text NOT NULL` 추가

dev-app 에 ssh 로 접속해서 직접 변경 (또는 Drizzle migration):

```bash
ssh -i ~/Desktop/aws-infra/portal-ai-key.pem ec2-user@54.116.104.193 \
  'sudo docker exec database psql -U postgres -d portal -c "ALTER TABLE admin_profiles ADD COLUMN password_hash text"'
```

**2) 기존 admin 4명에게 임시 password 발급**:
- bcrypt hash 생성 (`bcrypt.hash(<temp-password>, 10)`)
- 각 admin 의 password_hash 업데이트
- 첫 로그인 시 password 변경 강제 (별도 페이지 or invite 코드)

**3) Auth.js 설치 + config**:

```bash
pnpm add next-auth@beta @auth/drizzle-adapter bcryptjs
pnpm add -D @types/bcryptjs
```

**파일**: `src/auth.ts` (신규 — Auth.js v5 패턴)

```typescript
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import bcrypt from "bcryptjs"
import { db } from "@/lib/database"
import { sql } from "drizzle-orm"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const result = await db.execute(sql`
          SELECT user_id, password_hash, status FROM admin_profiles
          WHERE email = ${credentials.email} AND status = 'approved' LIMIT 1
        `)
        const row = result.rows[0]
        if (!row) return null
        const valid = await bcrypt.compare(credentials.password as string, row.password_hash as string)
        if (!valid) return null
        return { id: row.user_id as string, email: credentials.email as string }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
})
```

**4) Middleware 교체** (`src/proxy.ts` 또는 `middleware.ts`):

```typescript
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }
})

export const config = { matcher: ["/admin/:path*"] }
```

**5) `requireApprovedAdmin()` 교체** (`src/lib/admin-auth.ts`):

기존 supabase ssr 의존 → `import { auth } from "@/auth"` + `await auth()` 사용

**6) `/admin/signup` 페이지 비활성화** (또는 invite 코드):

스펙: "관리자가 DB에서 직접 생성. 또는 invite 코드 — 비스코프, 추후"

### D. .env 정리 (필수, 5분)

**제거**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*`

**추가**:
```env
DATABASE_URL=postgresql://app_user:<APP_USER_PASSWORD>@db:5432/kikoai?sslmode=require
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=http://54.116.104.193   # P1 시점 EIP, 도메인 붙으면 변경
AI_SERVER_URL=http://172.31.61.166:8000   # dev-ai 사설 IP
# 기존 R2, OPENAI_API_KEY, APIFY_TOKEN 등 — Vercel 에서 가져온 값 그대로
```

dev-app 의 `.env` (서버 `~/kikoai-app/env/.env`) 와 동기화. APP_USER_PASSWORD 는 이미 dev-app 의 .env 에 있으니 거기서 복사.

### E. @supabase/* 패키지 제거 (마지막, 10분)

```bash
pnpm remove @database/ssr @database/database-js
# src/lib/database*.ts 파일 삭제
# 검색해서 import { createClient } from "@/lib/database/..." 사용처 모두 교체
```

---

## 4. 검증 (acceptance.md AC-003, AC-005)

```bash
# (1) 로컬 빌드
pnpm run build   # standalone 출력 → .next/standalone/ 생성 확인

# (2) Docker 빌드 (로컬, M-series Mac 에서 ARM64 native)
docker buildx build --platform=linux/arm64 -t kiko.ai-app:local --load .

# (3) 컨테이너 띄우고 검증
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://app_user:<PWD>@<dev-app-IP>:5432/kikoai?sslmode=require \
  -e NEXTAUTH_SECRET=<...> \
  kiko.ai-app:local
curl http://localhost:3000/api/health
# → 200 {"status":"ok"}

# (4) PR merge → GHA → dev-app 자동 배포
```

---

## 5. 함정 / 주의사항

1. **PG 17 (Supabase) → PG 16 (dev-app)**: dump 는 PG 17 client 로 했음. 운영 코드는 PG 16 client lib (pg 8.x) 로 충분.
2. **products.embedding 0 nonnull**: Supabase 측도 NULL — embedding 검색은 P8 이후 별도 풀배치. 그 전엔 검색 결과 0 row.
3. **RLS 정책 12개 마이그 fail**: Supabase auth.authenticated/anon role 의존이라 dev-app 에 미적용. Auth.js 로 application-level 권한 처리 (DB row-level X).
4. **auth.users FK**: admin_profiles 의 user_id 가 Supabase auth.users 참조. Auth.js 마이그 시 auth.users 없음 → user_id 컬럼은 그대로 두되 FK constraint 제거 권장.
5. **SSL cert**: dev-app Postgres 는 self-signed. Drizzle/pg 의 `ssl: { rejectUnauthorized: false }` 필수.
6. **dev-ai (kikoai/ai) 와 같은 VPC**: dev-ai 사설 IP 172.31.61.166 → dev-app 5432 SG 허용됨. kikoai/app 안에서 AI_SERVER_URL=`http://172.31.61.166:8000` 로 호출 (P6 까지는 kikoai/ai 가 Supabase 가리킴이라 결과 inconsistent — P7 cutover 까지 임시).

---

## 6. 끝나면 다음

- **P6** (kikoai/ai 리포): SupabaseProvider → asyncpg, .env DATABASE_URL 갱신
- **P7** Cutover: Supabase write 차단 + delta dump + 양 서비스 .env 동시 전환 + 24h 모니터링
- **P8**: Vercel 프로젝트 off, Supabase 폐기, docs 동기화

---

## 7. 참조

- SPEC: `/Users/hansangho/Desktop/aws-infra/.moai/specs/SPEC-INFRA-MIGRATE-001/`
  - `spec.md` (정식 명세 + REQ-001~006)
  - `plan.md` (P1~P8 실행 계획)
  - `acceptance.md` (AC-003 어드민 인증 / AC-005 kikoai/app self-host 시나리오)
  - `progress.md` (현 진척: P1~P5 인프라까지 done)
- aws-infra 의 dev-app 운영 가이드: `/Users/hansangho/Desktop/aws-infra/kikoai-dev-servers/app/README.md`
- dev-app 의 `.env` (실값): `ssh ec2-user@54.116.104.193 'cat ~/kikoai-app/env/.env'`
- Auth.js v5 docs: https://authjs.dev/getting-started/installation
- Drizzle docs: https://orm.drizzle.team/docs/get-started/postgresql-new

---

작성: aws-infra 세션 (2026-05-07). 다음 세션 (kikoai/app) 에서 이 문서 픽업해서 진행 가능.
