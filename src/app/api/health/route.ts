// Liveness probe for Docker HEALTHCHECK + EC2 deploy 스크립트.
// 외부 의존성(DB/LLM/R2) 체크 없이 프로세스가 살아있고 라우터가 응답하는지만 본다.
// 외부 의존성 검증은 별도 readiness 엔드포인트(필요 시) 또는 /api/admin/pipeline-health.

export const dynamic = "force-dynamic"

export async function GET() {
  return new Response("ok", {
    status: 200,
    headers: {"Content-Type": "text/plain", "Cache-Control": "no-store"},
  })
}
