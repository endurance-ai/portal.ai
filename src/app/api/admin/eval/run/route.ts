import { NextRequest, NextResponse } from "next/server"
import { requireApprovedAdmin } from "@/lib/admin-auth"
import { supabase } from "@/lib/supabase"
import { routeAlgorithmVersion, upsertJudgment } from "@/lib/eval/judgment-store"

// SPEC-V6-EVAL T-010 — Algorithm Run + Judgment Persistence (REQ-V6-EVAL-002)
// @MX:WARN: [AUTO] /api/search-products 를 _includeScoring=true 로 호출 — 잠재적 부하. 향후 rate-limit 고려.
// @MX:REASON: 어드민 라벨링 트리거가 매번 무거운 검색을 재실행. 30 골든셋 × 반복 호출 시 백엔드 부담.

interface RunBody {
  goldenQueryId?: string
  algorithmVersion?: string
}

interface SearchProduct {
  brand: string
  title: string
  link: string
  imageUrl: string
  price: string
  platform: string
  description?: string
  material?: string
  reviewCount?: number
  matchReasons?: unknown
  _scoring?: unknown
}

interface SearchResponseShape {
  results?: Array<{ id: string; products: SearchProduct[] }>
  error?: string
}

function productKey(p: SearchProduct): string {
  // products 테이블의 PK 가 우리에게 직접 노출되지 않으므로 link 를 안정 키로 사용.
  return p.link
}

export async function POST(request: NextRequest) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate
  const { user } = gate

  const body = (await request.json().catch(() => ({}))) as RunBody
  if (!body.goldenQueryId || !body.algorithmVersion) {
    return NextResponse.json({ error: "goldenQueryId, algorithmVersion 필수" }, { status: 400 })
  }

  let algorithmVersion: "v4" | "v6"
  try {
    algorithmVersion = routeAlgorithmVersion(body.algorithmVersion)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  // 1) golden query 로드
  const { data: gq, error: gqError } = await supabase
    .from("eval_golden_queries")
    .select("id, instagram_url, query_signature, intent_note")
    .eq("id", body.goldenQueryId)
    .maybeSingle()
  if (gqError) return NextResponse.json({ error: gqError.message }, { status: 500 })
  if (!gq) return NextResponse.json({ error: "golden query not found" }, { status: 404 })

  // 2) /api/search-products 내부 호출 — intent_note / query_signature 를 free-form query 로 사용
  const seedText = (gq.query_signature as string | null) || (gq.intent_note as string)
  const origin = request.nextUrl.origin
  const searchPayload = {
    queries: [
      {
        id: "eval-q",
        category: "all",
        searchQuery: seedText,
      },
    ],
    _includeScoring: true,
  }

  let searchJson: SearchResponseShape
  try {
    const res = await fetch(`${origin}/api/search-products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(searchPayload),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: "search-products 호출 실패", code: "SEARCH_PRODUCTS_FAILED", status: res.status },
        { status: 502 },
      )
    }
    searchJson = (await res.json()) as SearchResponseShape
  } catch (e) {
    return NextResponse.json(
      { error: `search-products 호출 예외: ${(e as Error).message}`, code: "SEARCH_PRODUCTS_FAILED" },
      { status: 502 },
    )
  }

  const flat: SearchProduct[] = (searchJson.results ?? []).flatMap((r) => r.products ?? [])
  const top10 = flat.slice(0, 10)

  // 3) 각 product 에 대해 grade=0 placeholder upsert (라벨링 큐 생성)
  let judgmentRowsCreated = 0
  for (const p of top10) {
    try {
      // products 테이블의 UUID 가 link 로 직접 매핑되지 않을 수 있어, products lookup 시도.
      const { data: prodRow } = await supabase
        .from("products")
        .select("id")
        .eq("link", productKey(p))
        .maybeSingle()
      if (!prodRow) continue
      await upsertJudgment({
        goldenQueryId: body.goldenQueryId,
        productId: prodRow.id as string,
        relevanceGrade: 0,
        labelerId: user.email ?? user.id,
        algorithmVersion,
      })
      judgmentRowsCreated += 1
    } catch {
      // 개별 upsert 실패는 무시 — 이미 존재하면 unique 위반, products 미발견은 skip.
    }
  }

  return NextResponse.json({ rankedProducts: top10, judgmentRowsCreated })
}
