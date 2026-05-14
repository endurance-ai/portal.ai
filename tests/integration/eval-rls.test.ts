/**
 * SPEC-V6-EVAL T-002 — RLS deny test for eval_* tables (REQ-V6-EVAL-005)
 *
 * 이 테스트는 실제 Supabase 인스턴스에 anon key 로 접속해
 *   eval_golden_queries / eval_judgments / eval_runs 3개 테이블 모두에서
 *   SELECT 가 빈 결과를 반환하고 INSERT 가 RLS 위반으로 실패하는지 검증한다.
 *
 * 정상 dev 실행에서는 SUPABASE_TEST_URL / SUPABASE_ANON_KEY 미설정 시
 * `describe.skipIf` 로 전체 스킵된다. CI 또는 수동 실행 시에만 활성화.
 *
 * 활성화하려면:
 *   SUPABASE_TEST_URL=https://<project>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon-key> \
 *   pnpm test tests/integration/eval-rls.test.ts
 */

import {describe, expect, it} from "vitest"
import {createClient} from "@supabase/supabase-js"

const TEST_URL = process.env.SUPABASE_TEST_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY

describe.skipIf(!TEST_URL || !ANON_KEY)(
  "eval_* RLS deny (REQ-V6-EVAL-005)",
  () => {
    // Lazy client: describe 콜백은 skipIf 와 무관하게 한 번 실행되므로
    // createClient 를 즉시 호출하면 env 미설정 시 collection-time 에러가 난다.
    const getAnon = () =>
      createClient(TEST_URL!, ANON_KEY!, {
        auth: {persistSession: false, autoRefreshToken: false},
      })

    // ---- eval_golden_queries ----

    it("anon SELECT eval_golden_queries returns empty (RLS filter)", async () => {
      const {data, error} = await getAnon()
        .from("eval_golden_queries")
        .select("id")
        .limit(1)
      // RLS 가 row 를 가리는 경우 error 없이 빈 배열을 반환하는 게 정상.
      // 일부 환경에서는 PGRST 권한 에러를 던질 수도 있으므로 둘 다 허용.
      if (error) {
        expect(error.code).toBeDefined()
      } else {
        expect(data).toEqual([])
      }
    })

    it("anon INSERT eval_golden_queries fails", async () => {
      const {error} = await getAnon().from("eval_golden_queries").insert({
        instagram_url: "https://instagram.com/p/rls-test",
        intent_note: "rls deny probe",
        created_by: "rls-test@example.com",
      })
      expect(error).not.toBeNull()
    })

    // ---- eval_judgments ----

    it("anon SELECT eval_judgments returns empty (RLS filter)", async () => {
      const {data, error} = await getAnon()
        .from("eval_judgments")
        .select("id")
        .limit(1)
      if (error) {
        expect(error.code).toBeDefined()
      } else {
        expect(data).toEqual([])
      }
    })

    it("anon INSERT eval_judgments fails", async () => {
      const {error} = await getAnon().from("eval_judgments").insert({
        // golden_query_id / product_id 를 임의 uuid 로 채워도 RLS 가 먼저 차단.
        golden_query_id: "00000000-0000-0000-0000-000000000000",
        product_id: "00000000-0000-0000-0000-000000000000",
        relevance_grade: 0,
        labeler_id: "rls-test",
        algorithm_version: "v4",
      })
      expect(error).not.toBeNull()
    })

    // ---- eval_runs ----

    it("anon SELECT eval_runs returns empty (RLS filter)", async () => {
      const {data, error} = await getAnon()
        .from("eval_runs")
        .select("id")
        .limit(1)
      if (error) {
        expect(error.code).toBeDefined()
      } else {
        expect(data).toEqual([])
      }
    })

    it("anon INSERT eval_runs fails", async () => {
      const {error} = await getAnon().from("eval_runs").insert({
        algorithm_version: "v4",
        ndcg_at_10: 0.5,
        precision_at_5: 0.5,
        query_count: 0,
        judgment_count: 0,
      })
      expect(error).not.toBeNull()
    })
  },
)
