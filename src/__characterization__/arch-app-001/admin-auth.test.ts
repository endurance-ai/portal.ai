/**
 * SPEC-ARCH-APP-001 PRESERVE — admin / internal auth gates.
 *
 * Pins the authz decision behavior that protects all 28 admin routes and the
 * internal classify-brand route, before admin code moves to
 * `src/domains/admin-tools/`. These gates are the security boundary the SPEC
 * acceptance gate 3 ("requireApprovedAdmin bypass blocked, non-admin 403")
 * requires to be byte-identical post-move.
 *
 *   1. requireApprovedAdmin (src/lib/admin-auth.ts) — Auth.js session gate.
 *      `@/auth` is mocked so we characterize ONLY the gate's decision logic
 *      (no session -> 401, non-approved -> 403, approved -> pass) without a
 *      live pg Pool / Auth.js runtime.
 *
 *   2. requireInternalKey (src/lib/auth/internal.ts) — timing-safe shared-key
 *      gate for the internal route. Pure (env + header), fully exercised.
 *
 * QUIRK comments mark surprising-but-pinned behavior (exact status codes /
 * error body strings the admin frontend depends on).
 */

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

// ── Neutralize `import "server-only"` (admin-auth.ts + auth/internal.ts) ──
// The `server-only` package throws when bundled outside an RSC context.
// Stubbing it to a no-op lets us characterize the gate logic in jsdom
// WITHOUT touching production code (PRESERVE: no source moves/edits).
vi.mock("server-only", () => ({}))

// ── Mock @/auth so admin-auth.ts can run without Auth.js / pg ──────────────
const mockAuth = vi.fn()
vi.mock("@/auth", () => ({
  auth: () => mockAuth(),
}))

// Imported AFTER vi.mock so the mock is in place.
import {requireApprovedAdmin, getAdminStatus} from "@/lib/admin-auth"
import {requireInternalKey} from "@/lib/auth/internal"

async function bodyOf(res: unknown): Promise<{status: number; json: unknown}> {
  const r = res as Response
  return {status: r.status, json: await r.json()}
}

describe("requireApprovedAdmin — admin route authz gate", () => {
  beforeEach(() => {
    mockAuth.mockReset()
  })

  it("no session -> 401 Unauthorized (NextResponse, not throw)", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await requireApprovedAdmin()
    expect(res).toBeInstanceOf(Response)
    expect(await bodyOf(res)).toEqual({
      status: 401,
      json: {error: "Unauthorized"},
    })
  })

  it("QUIRK: session present but missing id/email/status -> treated as NO user -> 401 (not 403)", async () => {
    mockAuth.mockResolvedValue({user: {email: "x@y.z"}}) // no id, no status
    expect(await bodyOf(await requireApprovedAdmin())).toEqual({
      status: 401,
      json: {error: "Unauthorized"},
    })
  })

  it("authenticated but status=pending -> 403 Forbidden", async () => {
    mockAuth.mockResolvedValue({
      user: {id: "u1", email: "a@b.c", status: "pending"},
    })
    expect(await bodyOf(await requireApprovedAdmin())).toEqual({
      status: 403,
      json: {error: "Forbidden"},
    })
  })

  it("authenticated but status=rejected -> 403 Forbidden", async () => {
    mockAuth.mockResolvedValue({
      user: {id: "u1", email: "a@b.c", status: "rejected"},
    })
    expect(await bodyOf(await requireApprovedAdmin())).toEqual({
      status: 403,
      json: {error: "Forbidden"},
    })
  })

  it("status=approved -> PASS, returns { user } (no Response)", async () => {
    mockAuth.mockResolvedValue({
      user: {id: "u9", email: "admin@kiko.ai", status: "approved"},
    })
    const res = await requireApprovedAdmin()
    expect(res).not.toBeInstanceOf(Response)
    expect(res).toEqual({
      user: {id: "u9", email: "admin@kiko.ai", status: "approved"},
    })
  })

  it("getAdminStatus surfaces null user/status when no session", async () => {
    mockAuth.mockResolvedValue(undefined)
    // QUIRK: getAdminStatus is wrapped in React.cache — first call result is
    // memoized for the render. We assert the shape, not call-count.
    const r = await getAdminStatus()
    expect(r).toEqual({user: null, status: null})
  })
})

describe("requireInternalKey — internal route shared-key gate", () => {
  const ORIG = process.env.INTERNAL_API_KEY

  function req(headers: Record<string, string> = {}): Request {
    return new Request("https://x/api/internal/classify-brand", {headers})
  }

  afterEach(() => {
    if (ORIG === undefined) delete process.env.INTERNAL_API_KEY
    else process.env.INTERNAL_API_KEY = ORIG
  })

  it("server misconfigured (no key) -> 500", async () => {
    delete process.env.INTERNAL_API_KEY
    const res = requireInternalKey(req({"x-internal-key": "whatever"}))
    expect(res).toBeInstanceOf(Response)
    expect(await bodyOf(res)).toEqual({
      status: 500,
      json: {ok: false, error: "INTERNAL_API_KEY not configured on server"},
    })
  })

  it("QUIRK: key shorter than 16 chars -> 500 (treated as misconfigured, NOT 401)", async () => {
    process.env.INTERNAL_API_KEY = "short"
    expect(await bodyOf(requireInternalKey(req({"x-internal-key": "short"})))).toEqual({
      status: 500,
      json: {ok: false, error: "INTERNAL_API_KEY not configured on server"},
    })
  })

  it("missing X-Internal-Key header -> 401 (missing)", async () => {
    process.env.INTERNAL_API_KEY = "a".repeat(20)
    expect(await bodyOf(requireInternalKey(req()))).toEqual({
      status: 401,
      json: {ok: false, error: "unauthorized (missing X-Internal-Key)"},
    })
  })

  it("wrong key (same length) -> 401 (invalid)", async () => {
    process.env.INTERNAL_API_KEY = "a".repeat(20)
    expect(
      await bodyOf(requireInternalKey(req({"x-internal-key": "b".repeat(20)}))),
    ).toEqual({
      status: 401,
      json: {ok: false, error: "unauthorized (invalid X-Internal-Key)"},
    })
  })

  it("QUIRK: wrong key of different length -> 401 invalid (length-guarded, no timingSafeEqual throw)", async () => {
    process.env.INTERNAL_API_KEY = "a".repeat(20)
    expect(
      await bodyOf(requireInternalKey(req({"x-internal-key": "a".repeat(5)}))),
    ).toEqual({
      status: 401,
      json: {ok: false, error: "unauthorized (invalid X-Internal-Key)"},
    })
  })

  it("correct key -> returns true (pass)", () => {
    process.env.INTERNAL_API_KEY = "correct-horse-battery-staple"
    expect(
      requireInternalKey(req({"x-internal-key": "correct-horse-battery-staple"})),
    ).toBe(true)
  })
})
