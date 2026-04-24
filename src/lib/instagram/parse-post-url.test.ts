import {describe, expect, it} from "vitest"
import {parsePostUrl} from "./parse-post-url"

describe("parsePostUrl", () => {
  it("accepts full https URL with trailing slash", () => {
    expect(parsePostUrl("https://www.instagram.com/p/DXeu2onFIZ8/")).toEqual({
      shortcode: "DXeu2onFIZ8",
    })
  })

  it("accepts URL with query string", () => {
    expect(
      parsePostUrl("https://www.instagram.com/p/DXeu2onFIZ8/?hl=ko&img_index=1")
    ).toEqual({shortcode: "DXeu2onFIZ8"})
  })

  it("accepts URL without protocol", () => {
    expect(parsePostUrl("instagram.com/p/DXeu2onFIZ8")).toEqual({
      shortcode: "DXeu2onFIZ8",
    })
  })

  it("accepts handle-prefixed form (share URL)", () => {
    expect(
      parsePostUrl("https://www.instagram.com/patagonia/p/DXeu2onFIZ8/")
    ).toEqual({shortcode: "DXeu2onFIZ8"})
  })

  it("accepts bare shortcode", () => {
    expect(parsePostUrl("DXeu2onFIZ8")).toEqual({shortcode: "DXeu2onFIZ8"})
  })

  it("accepts shortcode with dashes/underscores", () => {
    expect(parsePostUrl("https://www.instagram.com/p/DXX0n-0Gb1t/")).toEqual({
      shortcode: "DXX0n-0Gb1t",
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
      /valid/i
    )
  })

  it("rejects malformed bare input", () => {
    expect(() => parsePostUrl("!!!")).toThrow()
  })
})
