/**
 * SPEC-ARCH-APP-001 PRESERVE — main-flow (Instagram -> Vision -> search) path.
 *
 * Pins the ai-INDEPENDENT pieces of the main flow before they move to
 * `src/domains/{instagram,vision,search-v5-client}`:
 *
 *   1. parsePostUrl  (src/lib/instagram/parse-post-url.ts) — the IG entry
 *      parser. URL/shortcode acceptance + img_index extraction + reject codes.
 *      This is the front door of `/` and must behave identically post-move.
 *
 *   2. toSearchProduct shape mapping — the AICandidate -> SearchProduct
 *      reshape that `find/search/route.ts` applies before responding to
 *      `find-client.tsx`. The /recommend NETWORK contract is owned by
 *      SPEC-ARCH-AI-001 and is DEFERRED; only the pure local shape transform
 *      is pinned here (it determines what find-result.tsx renders).
 *
 * QUIRK comments mark surprising-but-pinned behavior.
 */

import {describe, expect, it} from "vitest"
import {parsePostUrl} from "@/lib/instagram/parse-post-url"
import {InstagramFetchError} from "@/lib/instagram/types"

describe("parsePostUrl — main-flow IG entry parser", () => {
  it("accepts canonical /p/ post URL, imgIndex null when absent", () => {
    expect(parsePostUrl("https://www.instagram.com/p/ABC123/")).toEqual({
      shortcode: "ABC123",
      imgIndex: null,
    })
  })

  it("accepts /<user>/p/<sc>/ form", () => {
    expect(parsePostUrl("https://www.instagram.com/some.user/p/ABC123/")).toEqual({
      shortcode: "ABC123",
      imgIndex: null,
    })
  })

  it("accepts bare shortcode (no slash) -> imgIndex null", () => {
    expect(parsePostUrl("ABC123")).toEqual({shortcode: "ABC123", imgIndex: null})
  })

  it("extracts ?img_index=N (1-indexed) when valid 1..50", () => {
    expect(parsePostUrl("https://www.instagram.com/p/ABC123/?img_index=4")).toEqual({
      shortcode: "ABC123",
      imgIndex: 4,
    })
  })

  it("QUIRK: out-of-range / non-integer img_index silently falls back to null (URL still OK)", () => {
    expect(parsePostUrl("https://www.instagram.com/p/ABC123/?img_index=0").imgIndex).toBeNull()
    expect(parsePostUrl("https://www.instagram.com/p/ABC123/?img_index=51").imgIndex).toBeNull()
    expect(parsePostUrl("https://www.instagram.com/p/ABC123/?img_index=abc").imgIndex).toBeNull()
  })

  it("QUIRK: bare shortcode never carries img_index even with query-like suffix", () => {
    // No slash, no scheme -> treated as bare shortcode path; "?img_index" would
    // fail SHORTCODE_RE. A clean bare code returns imgIndex null always.
    expect(parsePostUrl("ABC_de-12").imgIndex).toBeNull()
  })

  it("accepts scheme-less host (prepends https://)", () => {
    expect(parsePostUrl("www.instagram.com/p/XY99zz/")).toEqual({
      shortcode: "XY99zz",
      imgIndex: null,
    })
  })

  function code(fn: () => unknown): string {
    try {
      fn()
      return "(no throw)"
    } catch (e) {
      return e instanceof InstagramFetchError ? e.code : `(non-IGError: ${e})`
    }
  }

  it("rejects reels / IGTV with REEL_NOT_SUPPORTED", () => {
    expect(code(() => parsePostUrl("https://www.instagram.com/reel/ABC123/"))).toBe("REEL_NOT_SUPPORTED")
    expect(code(() => parsePostUrl("https://www.instagram.com/reels/ABC123/"))).toBe("REEL_NOT_SUPPORTED")
    expect(code(() => parsePostUrl("https://www.instagram.com/tv/ABC123/"))).toBe("REEL_NOT_SUPPORTED")
  })

  it("rejects non-instagram host with INVALID_URL (substring-match attack blocked)", () => {
    expect(code(() => parsePostUrl("https://evilinstagram.com/p/ABC123/"))).toBe("INVALID_URL")
    expect(code(() => parsePostUrl("https://instagram.com.evil.com/p/ABC123/"))).toBe("INVALID_URL")
  })

  it("rejects empty / overlong / unparseable input with INVALID_URL", () => {
    expect(code(() => parsePostUrl(""))).toBe("INVALID_URL")
    expect(code(() => parsePostUrl("   "))).toBe("INVALID_URL")
    expect(code(() => parsePostUrl("x".repeat(2049)))).toBe("INVALID_URL")
    expect(code(() => parsePostUrl("https://www.instagram.com/explore/"))).toBe("INVALID_URL")
  })

  it("rejects malformed shortcode-in-URL with INVALID_URL", () => {
    // path matches /p/<x>/ but x fails SHORTCODE_RE (too short)
    expect(code(() => parsePostUrl("https://www.instagram.com/p/ab/"))).toBe("INVALID_URL")
  })

  it("snapshot of acceptance matrix (regression net)", () => {
    const cases = [
      "https://www.instagram.com/p/ABC123/",
      "https://www.instagram.com/p/ABC123/?img_index=2",
      "https://www.instagram.com/user1/p/ABC123/",
      "instagram.com/p/ABC123/",
      "ABCDE",
      "https://www.instagram.com/reel/ABC123/",
      "https://evilinstagram.com/p/ABC123/",
      "",
    ]
    const matrix = cases.map((c) => {
      try {
        const r = parsePostUrl(c)
        return {input: c, ok: true, ...r}
      } catch (e) {
        return {
          input: c,
          ok: false,
          code: e instanceof InstagramFetchError ? e.code : "?",
        }
      }
    })
    expect(matrix).toMatchInlineSnapshot(`
      [
        {
          "imgIndex": null,
          "input": "https://www.instagram.com/p/ABC123/",
          "ok": true,
          "shortcode": "ABC123",
        },
        {
          "imgIndex": 2,
          "input": "https://www.instagram.com/p/ABC123/?img_index=2",
          "ok": true,
          "shortcode": "ABC123",
        },
        {
          "imgIndex": null,
          "input": "https://www.instagram.com/user1/p/ABC123/",
          "ok": true,
          "shortcode": "ABC123",
        },
        {
          "imgIndex": null,
          "input": "instagram.com/p/ABC123/",
          "ok": true,
          "shortcode": "ABC123",
        },
        {
          "imgIndex": null,
          "input": "ABCDE",
          "ok": true,
          "shortcode": "ABCDE",
        },
        {
          "code": "REEL_NOT_SUPPORTED",
          "input": "https://www.instagram.com/reel/ABC123/",
          "ok": false,
        },
        {
          "code": "INVALID_URL",
          "input": "https://evilinstagram.com/p/ABC123/",
          "ok": false,
        },
        {
          "code": "INVALID_URL",
          "input": "",
          "ok": false,
        },
      ]
    `)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// toSearchProduct — pure shape transform from find/search/route.ts (~178-185).
// NOTE: the /recommend network contract is DEFERRED (ai-owned). Only this
// local AICandidate -> SearchProduct reshape is pinned, since it decides what
// find-result.tsx renders. Lifted verbatim.
// ──────────────────────────────────────────────────────────────────────────

type AICandidate = {
  id: string
  brand: string
  name: string
  price: number | null
  imageUrl: string | null
  productUrl: string | null
  platform: string | null
  subcategory: string | null
  score: number
}

function toSearchProduct(c: AICandidate) {
  return {
    brand: c.brand,
    title: c.name,
    price: c.price != null ? `₩${c.price.toLocaleString("ko-KR")}` : "",
    platform: c.platform ?? "",
    imageUrl: c.imageUrl ?? "",
    link: c.productUrl ?? "",
  }
}

describe("toSearchProduct — AICandidate -> SearchProduct reshape (ai-independent shape)", () => {
  it("maps name->title, productUrl->link, formats KRW price", () => {
    const c: AICandidate = {
      id: "1",
      brand: "Acme",
      name: "Wool Coat",
      price: 129000,
      imageUrl: "https://img/x.jpg",
      productUrl: "https://shop/x",
      platform: "cafe24",
      subcategory: "overcoat",
      score: 0.9,
    }
    expect(toSearchProduct(c)).toEqual({
      brand: "Acme",
      title: "Wool Coat",
      price: "₩129,000",
      platform: "cafe24",
      imageUrl: "https://img/x.jpg",
      link: "https://shop/x",
    })
  })

  it("QUIRK: null price -> empty string (NOT '₩0'); null url/platform/image -> empty string", () => {
    const c: AICandidate = {
      id: "2",
      brand: "B",
      name: "N",
      price: null,
      imageUrl: null,
      productUrl: null,
      platform: null,
      subcategory: null,
      score: 0,
    }
    expect(toSearchProduct(c)).toEqual({
      brand: "B",
      title: "N",
      price: "",
      platform: "",
      imageUrl: "",
      link: "",
    })
  })

  it("QUIRK: price 0 is NOT null -> renders '₩0' (only null/undefined collapse to '')", () => {
    const c: AICandidate = {
      id: "3",
      brand: "B",
      name: "N",
      price: 0,
      imageUrl: null,
      productUrl: null,
      platform: null,
      subcategory: null,
      score: 0,
    }
    expect(toSearchProduct(c).price).toBe("₩0")
  })

  it("QUIRK: id, subcategory, score are DROPPED from the rendered shape", () => {
    const out = toSearchProduct({
      id: "keep?",
      brand: "B",
      name: "N",
      price: 1,
      imageUrl: null,
      productUrl: null,
      platform: null,
      subcategory: "shirt",
      score: 0.5,
    })
    expect(Object.keys(out).sort()).toEqual([
      "brand",
      "imageUrl",
      "link",
      "platform",
      "price",
      "title",
    ])
  })
})
