import {cn} from "@/lib/utils"

interface Props {
  status: "success" | "partial" | "failed"
  className?: string
}

const LABELS: Record<Props["status"], string> = {
  success: "Success",
  partial: "Partial",
  failed: "Failed",
}

const STYLES: Record<Props["status"], string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
}

export function DnaStatusBadge({status, className}: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] tracking-[0.12em] uppercase border px-2 py-0.5",
        STYLES[status],
        className
      )}
    >
      {LABELS[status]}
    </span>
  )
}
