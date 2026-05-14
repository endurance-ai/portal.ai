import "server-only"
import {buildPrompt} from "@/lib/prompts/registry"

/**
 * 프롬프트 검색 전용 — 텍스트 입력 → 패션 아이템 추출.
 *
 * Prompt 본문은 DB (prompts 테이블, situation='prompt-search') 에서 fetch.
 * Admin 편집은 /admin/prompts.
 */

export async function getPromptSearchSystem(): Promise<string> {
  const {system} = await buildPrompt("prompt-search")
  return system
}

/**
 * User prompt — runtime placeholder ({{GENDER_LABEL}}, {{USER_REQUEST}}) 치환됨.
 *
 * @param prompt 사용자 입력 텍스트
 * @param gender 'male' | 'female' | 'women' | 'men' (정규화는 내부 처리)
 */
export async function getPromptSearchUser(
  prompt: string,
  gender: string,
): Promise<string> {
  const genderLabel =
    gender === "female" || gender === "women" ? "women" : "men"
  const {user} = await buildPrompt("prompt-search", {
    GENDER_LABEL: genderLabel,
    USER_REQUEST: prompt,
  })
  return user
}
