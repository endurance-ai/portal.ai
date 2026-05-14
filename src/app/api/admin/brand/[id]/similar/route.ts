import {NextRequest, NextResponse} from "next/server"
import {requireApprovedAdmin} from "@/lib/admin-auth"
import {findSimilarBrands} from "@/lib/brand-embed"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/brand/[id]/similar?limit=10
 *
 * SPEC-BRAND-EMBED-001 P5 / AC-002.
 * brand 의 FashionSigLIP cosine top-K 이웃 조회.
 */
export async function GET(
  request: NextRequest,
  context: {params: Promise<{id: string}>},
) {
  const gate = await requireApprovedAdmin()
  if (gate instanceof NextResponse) return gate

  const {id} = await context.params
  const brandId = Number.parseInt(id, 10)
  if (!Number.isFinite(brandId) || brandId <= 0) {
    return NextResponse.json({error: "invalid brand id"}, {status: 400})
  }

  const limitParam = request.nextUrl.searchParams.get("limit")
  const limit = Math.max(1, Math.min(parseInt(limitParam ?? "10", 10) || 10, 100))

  try {
    const similar = await findSimilarBrands(brandId, limit)
    return NextResponse.json({brand_id: brandId, similar})
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({error: message}, {status: 500})
  }
}
