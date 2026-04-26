"use client"

import {useState} from "react"
import {motion} from "framer-motion"
import {cn} from "@/lib/utils"
import {SectionMarker} from "@/components/ui/section-marker"
import {FEEDBACK_TAGS, type FeedbackRating, type FeedbackTagId} from "@/lib/feedback-tags"
import {useLocale} from "@/lib/i18n"
import type {DictKey} from "@/lib/i18n-dict"

interface StepFeedbackProps {
  analysisId: string | null
  feedbackSubmitted: boolean
  onSubmitFeedback: (data: {
    rating: FeedbackRating
    tags: FeedbackTagId[]
    comment: string
    email: string
  }) => void
  onAdjust: () => void
  onReset: () => void
}

type FeedbackStep = "rating" | "detail" | "done"

export function StepFeedback({
  feedbackSubmitted,
  onSubmitFeedback,
  onAdjust,
  onReset,
}: StepFeedbackProps) {
  const {t} = useLocale()
  const [step, setStep] = useState<FeedbackStep>(feedbackSubmitted ? "done" : "rating")
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [selectedTags, setSelectedTags] = useState<FeedbackTagId[]>([])
  const [comment, setComment] = useState("")
  const [email, setEmail] = useState("")

  const handleRating = (r: FeedbackRating) => {
    setRating(r)
    setStep("detail")
  }

  const toggleTag = (id: FeedbackTagId) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  const handleSubmit = () => {
    if (!rating) return
    onSubmitFeedback({ rating, tags: selectedTags, comment, email })
    setStep("done")
  }

  // Done state
  if (step === "done" || feedbackSubmitted) {
    return (
      <motion.div
        key="step-feedback-done"
        initial={{opacity: 0, y: 12}}
        animate={{opacity: 1, y: 0}}
        exit={{opacity: 0, y: -12}}
        transition={{duration: 0.35}}
        className="w-full max-w-[640px] mx-auto pt-8 pb-12"
      >
        <SectionMarker numeral="VI." title={t("qa.feedback.thanks")} aside="Step 6" />
        <div className="py-12 flex flex-col items-center text-center gap-4">
          <p className="text-[18px] font-semibold text-ink tracking-[-0.02em]">
            {t("qa.feedback.thanksSub")}
          </p>
          {email && (
            <p className="text-[14px] text-ink-muted leading-[1.6] max-w-[400px]">
              {t("qa.feedback.thanksEmail")}
            </p>
          )}
        </div>
        <div className="mt-8 flex items-center justify-center">
          <button
            type="button"
            onClick={onReset}
            className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
          >
            {t("qa.feedback.restart")}
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      key="step-feedback"
      initial={{opacity: 0, y: 12}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -12}}
      transition={{duration: 0.35}}
      className="w-full max-w-[640px] mx-auto pt-8 pb-12"
    >
      <SectionMarker numeral="VI." title={t("qa.feedback.title")} aside="Step 6" />

      {/* Rating */}
      {step === "rating" && (
        <div>
          <p className="text-[13px] font-medium text-ink-quiet tracking-[-0.01em] mb-6">
            {t("qa.feedback.prompt")}
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleRating("up")}
              className="p-4 border border-line text-ink hover:border-ink hover:bg-ink hover:text-cream transition-colors text-left"
            >
              <span className="text-[14px] font-medium tracking-[-0.01em]">{t("qa.feedback.up")}</span>
            </button>
            <button
              type="button"
              onClick={() => handleRating("down")}
              className="p-4 border border-line text-ink hover:border-ink hover:bg-ink hover:text-cream transition-colors text-left"
            >
              <span className="text-[14px] font-medium tracking-[-0.01em]">{t("qa.feedback.down")}</span>
            </button>
          </div>
          <div className="mt-8">
            <button
              type="button"
              onClick={onAdjust}
              className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
            >
              &larr; {t("qa.feedback.adjustBack")}
            </button>
          </div>
        </div>
      )}

      {/* Detail */}
      {step === "detail" && (
        <div>
          {rating === "down" && (
            <div className="mb-6">
              <p className="text-[13px] font-medium text-ink-quiet tracking-[-0.01em] mb-4">
                {t("qa.feedback.whatOff")}
              </p>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        "text-[12px] font-medium px-3 py-1.5 border transition-colors tracking-[-0.01em]",
                        isSelected
                          ? "bg-ink text-cream border-ink"
                          : "border-line text-ink-soft hover:border-ink hover:text-ink",
                      )}
                    >
                      {t(`tag.${tag.id}` as DictKey)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mb-6">
            <p className="text-[13px] font-medium text-ink-quiet tracking-[-0.01em] mb-3">
              {rating === "up" ? t("qa.feedback.goodPrompt") : t("qa.feedback.badPrompt")}
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("qa.feedback.commentPlaceholder")}
              rows={3}
              className="w-full bg-transparent border border-line p-3 text-[14px] font-medium text-ink tracking-[-0.01em] outline-none focus:border-ink resize-none placeholder:text-ink-quiet"
            />
          </div>

          <div className="mb-8 border-t border-line pt-6">
            <p className="text-[13px] font-semibold text-ink tracking-[-0.01em] mb-1">
              {t("qa.feedback.emailTitle")}
            </p>
            <p className="text-[12px] font-medium text-stone tracking-[-0.01em] mb-4">
              {t("qa.feedback.emailSub")}
            </p>
            <label className="flex items-baseline border-b border-ink pb-2 gap-2">
              <span className="text-[11px] text-ink-quiet uppercase tracking-[0.08em] min-w-[40px]">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 bg-transparent outline-none text-[14px] font-medium text-ink tracking-[-0.01em] placeholder:text-ink-quiet"
              />
            </label>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("rating")}
              className="text-[13px] font-medium text-ink-soft hover:text-ink tracking-[-0.01em]"
            >
              &larr; {t("qa.confirm.back")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="text-[13px] font-semibold bg-ink text-cream border border-ink px-5 py-2 hover:opacity-85 transition-opacity tracking-[-0.01em]"
            >
              {t("qa.feedback.send")} &rarr;
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
