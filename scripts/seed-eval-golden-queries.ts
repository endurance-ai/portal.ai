#!/usr/bin/env tsx
/**
 * Seed eval_golden_queries from analyses (created_at DESC, max 30 rows).
 *
 * @MX:NOTE: [AUTO] One-shot seed script for SPEC-V6-EVAL-V2 REQ-003.
 *           analyses → eval_golden_queries variant: query_signature derived
 *           from prompt_text (preferred) or items[0].searchQuery (fallback).
 *           Idempotent via per-row UPSERT with ignoreDuplicates against
 *           UNIQUE INDEX (instagram_url, query_signature) NULLS NOT DISTINCT
 *           (migration 033 line 33-34).
 *
 * Usage:
 *   pnpm seed:eval
 *   # or
 *   npx dotenv -e .env.local -- pnpm tsx scripts/seed-eval-golden-queries.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const SEED_LIMIT = 30
export const ALGORITHM_VERSION = "v4"
export const CREATED_BY = "seed-script:v6-eval-v2"

export interface AnalysisRow {
  id: string
  prompt_text: string | null
  items: Array<{ searchQuery?: string | null }> | null
  image_filename: string | null
}

export interface DerivedRow {
  query_signature: string
  intent_note: string
}

export interface SeedCounts {
  total: number
  seeded: number
  skipped_duplicate: number
  skipped_invalid: number
}

/**
 * @MX:NOTE: [AUTO] Pure derive function — prompt_text first, items[0].searchQuery fallback.
 */
export function deriveRow(row: AnalysisRow): DerivedRow | null {
  const prompt = (row.prompt_text ?? "").trim()
  const firstItemQuery = (row.items?.[0]?.searchQuery ?? "").trim()

  const signature = prompt || firstItemQuery
  if (!signature) return null

  const intent = (prompt.slice(0, 200) || firstItemQuery).trim()
  if (!intent) return null

  return { query_signature: signature, intent_note: intent }
}

export async function seedGoldenQueries(client: SupabaseClient): Promise<SeedCounts> {
  const { data: candidates, error } = await client
    .from("analyses")
    .select("id, prompt_text, items, image_filename")
    .order("created_at", { ascending: false })
    .limit(SEED_LIMIT)

  if (error) {
    throw new Error(`analyses SELECT failed: ${error.message}`)
  }

  const rows = (candidates ?? []) as AnalysisRow[]
  const counts: SeedCounts = {
    total: rows.length,
    seeded: 0,
    skipped_duplicate: 0,
    skipped_invalid: 0,
  }

  for (const row of rows) {
    const derived = deriveRow(row)
    if (!derived) {
      counts.skipped_invalid += 1
      continue
    }

    const payload = {
      instagram_url: null as string | null,
      query_signature: derived.query_signature,
      intent_note: derived.intent_note,
      created_by: CREATED_BY,
      algorithm_version: ALGORITHM_VERSION,
    }

    // Per-row upsert with ignoreDuplicates: returned row is null when duplicate,
    // populated when inserted. Race-safe vs migration 033 UNIQUE INDEX
    // (instagram_url, query_signature) NULLS NOT DISTINCT.
    const { data: inserted, error: upErr } = await client
      .from("eval_golden_queries")
      .upsert(payload, {
        onConflict: "instagram_url,query_signature",
        ignoreDuplicates: true,
      })
      .select("id")
      .maybeSingle()

    if (upErr) {
      throw new Error(`eval_golden_queries UPSERT failed (signature="${derived.query_signature}"): ${upErr.message}`)
    }

    if (inserted) {
      counts.seeded += 1
    } else {
      counts.skipped_duplicate += 1
    }
  }

  return counts
}

export function printCounts(counts: SeedCounts, log: (line: string) => void = console.log): void {
  log(`total candidates: ${counts.total}`)
  log(`seeded: ${counts.seeded}`)
  log(`skipped (duplicate): ${counts.skipped_duplicate}`)
  log(`skipped (invalid): ${counts.skipped_invalid}`)
}

async function main(): Promise<void> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error(
      "FATAL: missing env NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL). Re-run with `npx dotenv -e .env.local -- pnpm tsx scripts/seed-eval-golden-queries.ts`."
    )
    process.exit(1)
  }
  if (!serviceRoleKey) {
    console.error(
      "FATAL: missing env SUPABASE_SERVICE_ROLE_KEY. Re-run with `npx dotenv -e .env.local -- pnpm tsx scripts/seed-eval-golden-queries.ts`."
    )
    process.exit(1)
  }

  console.error(`[seed] target: ${supabaseUrl}`)

  const client = createClient(supabaseUrl, serviceRoleKey)
  const counts = await seedGoldenQueries(client)
  printCounts(counts)
  process.exit(0)
}

// Only run when invoked directly (not when imported by tests).
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /seed-eval-golden-queries\.(ts|js|mjs|cjs)$/.test(process.argv[1])

if (isDirectRun) {
  main().catch((err) => {
    console.error("FATAL:", err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
