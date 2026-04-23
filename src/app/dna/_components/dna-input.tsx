"use client"

import {useState, type FormEvent} from "react"

const LIME = "#D9FF00"

type FetchStatus = "idle" | "loading" | "success" | "error"

interface FetchResult {
  scrapeId: string
  handle: string
  profile: {
    handle: string
    fullName: string | null
    biography: string | null
    profilePicR2Url: string | null
    followerCount: number | null
    followingCount: number | null
    postCount: number | null
    isPrivate: boolean
    isVerified: boolean
    category: string | null
  }
  posts: Array<{
    orderIndex: number
    shortcode: string
    r2Url: string
    caption: string | null
    likeCount: number | null
  }>
  stats: {totalPosts: number; copiedPosts: number}
}

interface FetchError {
  error: string
  code: string
}

export function DnaInput() {
  const [value, setValue] = useState("")
  const [status, setStatus] = useState<FetchStatus>("idle")
  const [result, setResult] = useState<FetchResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim() || status === "loading") return
    setStatus("loading")
    setResult(null)
    setErrorMsg(null)

    try {
      const res = await fetch("/api/instagram/fetch", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({input: value.trim()}),
      })
      const json = (await res.json()) as FetchResult | FetchError
      if (!res.ok) {
        const err = json as FetchError
        setErrorMsg(friendlyMessage(err.code, err.error))
        setStatus("error")
        return
      }
      setResult(json as FetchResult)
      setStatus("success")
    } catch (err) {
      setErrorMsg((err as Error).message || "Network error")
      setStatus("error")
    }
  }

  const disabled = status === "loading" || !value.trim()

  return (
    <div className="w-full flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="w-full flex flex-col sm:flex-row items-stretch gap-3"
      >
        <label className="flex-1 relative flex items-center">
          <span className="absolute left-5 text-ink-quiet text-[15px] pointer-events-none select-none">
            @
          </span>
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="username or instagram.com/..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={status === "loading"}
            className="w-full h-[54px] pl-10 pr-5 bg-white border border-line rounded-none text-[15px] text-ink placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors disabled:opacity-60"
          />
        </label>

        <button
          type="submit"
          disabled={disabled}
          style={{
            backgroundColor: disabled ? "#1a1a1a" : LIME,
            color: disabled ? "#888" : "#0a0a0a",
          }}
          className="h-[54px] px-8 text-[13px] font-semibold tracking-[0.18em] uppercase transition-colors disabled:cursor-not-allowed"
        >
          {status === "loading" ? "Decoding…" : "Decode"}
        </button>
      </form>

      {status === "loading" && (
        <div className="text-[12px] tracking-[0.12em] uppercase text-ink-quiet">
          Reaching Instagram…
        </div>
      )}

      {status === "error" && errorMsg && (
        <div className="border border-line bg-white px-5 py-4 text-[13px] text-ink-soft">
          {errorMsg}
        </div>
      )}

      {status === "success" && result && (
        <ResultPanel result={result} />
      )}
    </div>
  )
}

function ResultPanel({result}: {result: FetchResult}) {
  return (
    <div className="mt-4 flex flex-col gap-6 text-left">
      <ProfileHeader result={result} />
      <PostGrid posts={result.posts} />
    </div>
  )
}

function ProfileHeader({result}: {result: FetchResult}) {
  const {profile, stats} = result
  return (
    <div className="flex items-center gap-5 border border-line bg-white px-5 py-5">
      {profile.profilePicR2Url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.profilePicR2Url}
          alt={profile.handle}
          className="w-16 h-16 rounded-full object-cover border border-line"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-line-mute" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-medium text-ink truncate">
            @{profile.handle}
          </span>
          {profile.isVerified && (
            <span className="text-[10px] tracking-[0.12em] uppercase text-ink-quiet">
              Verified
            </span>
          )}
        </div>
        {profile.fullName && (
          <div className="text-[13px] text-ink-soft truncate">{profile.fullName}</div>
        )}
        <div className="mt-1 text-[11px] tracking-[0.08em] uppercase text-ink-quiet flex gap-3">
          <span>{fmt(profile.followerCount)} followers</span>
          <span>·</span>
          <span>{fmt(profile.postCount)} posts</span>
          <span>·</span>
          <span>
            {stats.copiedPosts}/{stats.totalPosts} pulled
          </span>
        </div>
      </div>
    </div>
  )
}

function PostGrid({posts}: {posts: FetchResult["posts"]}) {
  if (posts.length === 0) return null
  return (
    <div className="grid grid-cols-3 gap-1">
      {posts.map((p) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={p.shortcode || p.orderIndex}
          src={p.r2Url}
          alt={p.caption?.slice(0, 60) || `post ${p.orderIndex}`}
          className="w-full aspect-square object-cover border border-line"
        />
      ))}
    </div>
  )
}

function fmt(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function friendlyMessage(code: string, fallback: string): string {
  switch (code) {
    case "INVALID_HANDLE":
      return "That doesn't look like a valid Instagram handle. Try @username or the full profile URL."
    case "NOT_FOUND":
      return "No Instagram account found with that handle."
    case "PRIVATE":
      return "This account is private — we can only read public profiles."
    case "BLOCKED":
      return "Instagram temporarily blocked us. Try again in a minute, or we'll need to route through a proxy."
    case "NETWORK":
      return "Couldn't reach Instagram. Check your connection and retry."
    default:
      return fallback || "Something went wrong."
  }
}
