import {describe, expect, it} from "vitest"
import {parsePostUrl} from "./parse-post-url"

describe("parsePostUrl", () => {
  it("accepts full https URL with trailing slash", () => {
    expect(parsePostUrl("https://www.instagram.com/p/DXeu2onFIZ8/")).toEqual({
      shortcode: "DXeu2onFIZ8",
      imgIndex: null,
    })
  })

  it("extracts img_index from query string (1-indexed)", () => {
    expect(
      parsePostUrl("https://www.instagram.com/p/DXeu2onFIZ8/?img_index=3")
    ).toEqual({shortcode: "DXeu2onFIZ8", imgIndex: 3})
  })

  it("ignores img_index alongside other query params", () => {
    expect(
      parsePostUrl("https://www.instagram.com/p/DXeu2onFIZ8/?hl=ko&img_index=7")
    ).toEqual({shortcode: "DXeu2onFIZ8", imgIndex: 7})
  })

  it("treats malformed img_index as null", () => {
    expect(
      parsePostUrl("https://www.instagram.com/p/DXeu2onFIZ8/?img_index=abc")
    ).toEqual({shortcode: "DXeu2onFIZ8", imgIndex: null})
  })

  it("treats out-of-range img_index as null", () => {
    expect(
      parsePostUrl("https://www.instagram.com/p/DXeu2onFIZ8/?img_index=0")
    ).toEqual({shortcode: "DXeu2onFIZ8", imgIndex: null})
    expect(
      parsePostUrl("https://www.instagram.com/p/DXeu2onFIZ8/?img_index=999")
    ).toEqual({shortcode: "DXeu2onFIZ8", imgIndex: null})
  })

  it("accepts URL without protocol", () => {
    expect(parsePostUrl("instagram.com/p/DXeu2onFIZ8")).toEqual({
      shortcode: "DXeu2onFIZ8",
      imgIndex: null,
    })
  })

  it("accepts handle-prefixed form (share URL)", () => {
    expect(
      parsePostUrl("https://www.instagram.com/patagonia/p/DXeu2onFIZ8/")
    ).toEqual({shortcode: "DXeu2onFIZ8", imgIndex: null})
  })

  it("accepts bare shortcode", () => {
    expect(parsePostUrl("DXeu2onFIZ8")).toEqual({
      shortcode: "DXeu2onFIZ8",
      imgIndex: null,
    })
  })

  it("accepts shortcode with dashes/underscores", () => {
    expect(parsePostUrl("https://www.instagram.com/p/DXX0n-0Gb1t/")).toEqual({
      shortcode: "DXX0n-0Gb1t",
      imgIndex: null,
    })
  })

  it("rejects /reel/ URLs with REEL_NOT_SUPPORTED", () => {
    expect(() =>
      parsePostUrl("https://www.instagram.com/reel/DXabcdefghi/")
    ).toThrow(/Reels/)
  })

  it("rejects /reels/ URLs", () => {
    expect(() => parsePostUrl("https://www.instagram.com/reels/DXabc/")).toThrow(
      /Reels/
    )
  })

  it("rejects /tv/ URLs", () => {
    expect(() => parsePostUrl("https://www.instagram.com/tv/DXabc/")).toThrow(
      /IGTV/
    )
  })

  it("rejects empty string", () => {
    expect(() => parsePostUrl("")).toThrow(/Empty/)
  })

  it("rejects obvious non-IG URL", () => {
    expect(() => parsePostUrl("https://twitter.com/foo/status/123")).toThrow(
      /Instagram|valid/i
    )
  })

  it("rejects lookalike domain (evilinstagram.com)", () => {
    expect(() =>
      parsePostUrl("https://evilinstagram.com/p/DXeu2onFIZ8/")
    ).toThrow(/Instagram/i)
  })

  it("rejects instagram.com as subpath of other host", () => {
    expect(() =>
      parsePostUrl("https://evil.com/instagram.com/p/DXeu2onFIZ8/")
    ).toThrow(/Instagram/i)
  })

  it("rejects malformed bare input", () => {
    expect(() => parsePostUrl("!!!")).toThrow()
  })

  it("rejects oversized input", () => {
    expect(() => parsePostUrl("x".repeat(3000))).toThrow(/long/i)
  })
})
