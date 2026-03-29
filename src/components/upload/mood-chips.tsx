"use client"

import {motion} from "framer-motion"

const SAMPLE_MOODS = ["Street", "Minimal", "Avant-garde"]

export function MoodChips() {
  return (
    <motion.div
      className="flex flex-wrap justify-center gap-3"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.1, delayChildren: 0.6 } } }}
    >
      {SAMPLE_MOODS.map((mood) => (
        <motion.div
          key={mood}
          variants={{
            hidden: { opacity: 0, scale: 0.8 },
            show: { opacity: 1, scale: 1 },
          }}
          className="px-4 py-2 bg-card border border-border text-muted-foreground text-xs font-mono font-bold tracking-wider rounded-lg hover:border-primary/30 hover:text-foreground transition-all cursor-default"
        >
          {mood}
        </motion.div>
      ))}
    </motion.div>
  )
}
