"use client"

import {useCallback, useRef, useState} from "react"
import {AnimatePresence, motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {FEEDBACK_TAGS, type FeedbackRating, type FeedbackTagId} from "@/lib/feedback-tags"

type Step = "thumbs" | "tags" | "detail" | "done"

interface FeedbackFlowProps {
  sessionId: string
  analysisId: string
}

/** Fire-and-forget POST to /api/feedback */
function sendFeedback(payload: Record<string, unknown>) {
  fetch("/api/feedback", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  }).catch(() => {/* silent */})
}

export function FeedbackFlow({sessionId, analysisId}: FeedbackFlowProps) {
  const [step, setStep] = useState<Step>("thumbs")
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<FeedbackTagId>>(new Set())
  const [comment, setComment] = useState("")
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const feedbackIdRef = useRef<string | null>(null)

  // Step 1: thumbs — immediately save
  const handleThumb = useCallback(async (r: FeedbackRating) => {
    setRating(r)

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({sessionId, analysisId, rating: r}),
      })
      const data = await res.json()
      if (data.feedbackId) feedbackIdRef.current = data.feedbackId
    } catch {/* silent */}

    if (r === "up") {
      setStep("detail")
    } else {
      setStep("tags")
    }
  }, [sessionId, analysisId])

  const toggleTag = useCallback((tag: FeedbackTagId) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }, [])

  // Step 2 done: save tags update
  const handleTagsDone = useCallback(() => {
    if (feedbackIdRef.current && selectedTags.size > 0) {
      sendFeedback({
        feedbackId: feedbackIdRef.current,
        tags: Array.from(selectedTags),
      })
    }
    setStep("detail")
  }, [selectedTags])

  // Step 3 done: save detail update
  const handleSubmit = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (feedbackIdRef.current && (comment.trim() || email.trim())) {
        await fetch("/api/feedback", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            feedbackId: feedbackIdRef.current,
            comment: comment.trim() || undefined,
            email: email.trim() || undefined,
          }),
        })
      }
    } catch {/* silent */}
    setSubmitting(false)
    setStep("done")
  }, [comment, email, submitting])

  // Skip detail step
  const handleSkip = useCallback(() => {
    setStep("done")
  }, [])

  if (step === "done") {
    return (
      <motion.div
        initial={{opacity: 0, y: 8}}
        animate={{opacity: 1, y: 0}}
        className="flex justify-center py-4"
      >
        <div className="flex items-center gap-3 px-5 py-3 bg-card border border-turquoise/30 rounded-xl">
          <span className="text-base">✦</span>
          <div>
            <p className="text-xs font-semibold text-foreground">Thanks for shaping portal.ai</p>
            <p className="text-[9px] text-muted-foreground">Your feedback makes the next result better.</p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      transition={{delay: 0.8}}
      className="py-6 space-y-4"
    >
      {/* Step 1: Thumbs */}
      <div className="text-center">
        <p className="text-[11px] font-mono text-muted-foreground mb-3 tracking-wider">
          How was this analysis?
        </p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => handleThumb("up")}
            className={cn(
              "w-14 h-14 border rounded-xl flex items-center justify-center transition-all duration-200 text-2xl",
              rating === "up"
                ? "border-turquoise bg-turquoise/10"
                : "border-border bg-card hover:border-outline/50",
            )}
          >
            👍
          </button>
          <button
            onClick={() => handleThumb("down")}
            className={cn(
              "w-14 h-14 border rounded-xl flex items-center justify-center transition-all duration-200 text-2xl",
              rating === "down"
                ? "border-turquoise bg-turquoise/10"
                : "border-border bg-card hover:border-outline/50",
            )}
          >
            👎
          </button>
        </div>
      </div>

      {/* Step 2: Tags (👎 only) */}
      <AnimatePresence>
        {step === "tags" && (
          <motion.div
            initial={{opacity: 0, height: 0}}
            animate={{opacity: 1, height: "auto"}}
            exit={{opacity: 0, height: 0}}
            className="overflow-hidden text-center"
          >
            <p className="text-[11px] font-mono text-muted-foreground mb-1">What could be better?</p>
            <p className="text-[9px] text-on-surface-variant mb-3">Select all that apply</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm mx-auto">
              {FEEDBACK_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-[11px] transition-all duration-150 border",
                    selectedTags.has(tag.id)
                      ? "bg-turquoise/12 border-turquoise/40 text-turquoise"
                      : "bg-card border-border text-muted-foreground hover:border-outline/50",
                  )}
                >
                  {tag.label}{selectedTags.has(tag.id) && " ✓"}
                </button>
              ))}
            </div>
            <button
              onClick={handleTagsDone}
              className="mt-4 px-6 py-2 bg-card border border-border rounded-lg text-xs font-mono text-foreground hover:bg-surface-dim transition-colors"
            >
              Next
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 3: Detail (text + email) — optional */}
      <AnimatePresence>
        {step === "detail" && (
          <motion.div
            initial={{opacity: 0, height: 0}}
            animate={{opacity: 1, height: "auto"}}
            exit={{opacity: 0, height: 0}}
            className="overflow-hidden"
          >
            <div className="max-w-sm mx-auto space-y-3">
              {/* Motivation message */}
              <div className="px-4 py-3 bg-surface-dim rounded-lg border-l-2 border-turquoise">
                <p className="text-[11px] text-foreground leading-relaxed">
                  Your voice shapes portal.ai
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  We&apos;re building this together — every bit of feedback helps us get better.
                </p>
              </div>

              {/* Text input */}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us more (optional)..."
                rows={2}
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-on-surface-variant outline-none resize-none focus:border-outline-focus"
              />

              {/* Email input */}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-on-surface-variant outline-none focus:border-outline-focus"
              />

              {/* Early adopter nudge */}
              <div className="flex items-start gap-2 px-3 py-2 bg-turquoise/5 border border-turquoise/12 rounded-lg">
                <span className="text-xs shrink-0 mt-0.5">✦</span>
                <p className="text-[9px] text-turquoise leading-relaxed">
                  Be among the first to know when we launch.
                  <span className="text-muted-foreground"> Early supporters get priority access & exclusive updates.</span>
                </p>
              </div>

              {/* Submit + Skip */}
              <div className="flex gap-2">
                <button
                  onClick={handleSkip}
                  className="flex-1 py-3 bg-card border border-border rounded-lg text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-[2] py-3 bg-primary text-background rounded-lg text-[11px] font-mono font-bold uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {submitting ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
