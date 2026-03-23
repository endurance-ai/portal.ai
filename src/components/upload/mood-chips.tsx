"use client"

import { motion } from "framer-motion"

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
          className="px-5 py-2.5 bg-gradient-to-r from-moodfit-primary-container/40 to-moodfit-secondary-container/40 text-moodfit-on-primary-container text-sm font-bold rounded-full border border-white/50 shadow-sm hover:scale-105 transition-transform cursor-default"
        >
          {mood}
        </motion.div>
      ))}
    </motion.div>
  )
}
