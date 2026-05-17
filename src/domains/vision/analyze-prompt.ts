import "server-only"
import {buildPrompt} from "@/lib/prompts/registry"

/**
 * AI 분석 프롬프트 — 이미지 → 스타일 노드 + 아이템 분석.
 *
 * Prompt 본문은 DB (prompts 테이블, situation='vision-analyze') 에서 fetch.
 * Admin 편집은 /admin/prompts.
 *
 * @deprecated for direct text edits — edit in DB via /admin/prompts instead.
 */

export async function getAnalyzeSystemPrompt(): Promise<string> {
  const {system} = await buildPrompt("vision-analyze")
  return system
}

export async function getAnalyzeUserPrompt(): Promise<string> {
  const {user} = await buildPrompt("vision-analyze")
  return user
}

/**
 * Legacy export — 옛 const 와 동일 의미.
 * 사용 가능한 곳에서는 `getAnalyzeUserPrompt()` 로 이전 권장.
 */
export const ANALYZE_USER_PROMPT =
  "Analyze this outfit photo. Identify all visible clothing items and the overall style mood."
