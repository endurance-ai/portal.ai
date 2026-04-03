"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

interface QueueItem {
  id: string
  created_at: string
  image_filename: string | null
  style_node_primary: string | null
  style_node_confidence: number | null
  detected_gender: string | null
  items: unknown[] | null
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function EvalQueue({ queue }: { queue: QueueItem[] }) {
  if (queue.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No pending analyses to review.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {queue.map((item) => (
        <Link
          key={item.id}
          href={`/admin/eval/${item.id}`}
          className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
        >
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">
                {formatTime(item.created_at)}
              </span>
              {item.style_node_primary && (
                <Badge variant="secondary" className="text-xs">
                  {item.style_node_primary}
                  {item.style_node_confidence != null && (
                    <span className="ml-1 opacity-60">
                      {Math.round(item.style_node_confidence * 100)}%
                    </span>
                  )}
                </Badge>
              )}
              {item.detected_gender && (
                <Badge variant="outline" className="text-xs">
                  {item.detected_gender}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {Array.isArray(item.items) ? item.items.length : 0} items
            </span>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      ))}
    </div>
  )
}
