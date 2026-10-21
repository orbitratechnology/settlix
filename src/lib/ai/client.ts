import "server-only"

import { createAnthropic } from "@ai-sdk/anthropic"

import { anthropicConfig } from "@/lib/env/server"

/** The provider's public API; pinned so an ambient ANTHROPIC_BASE_URL is ignored. */
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"

export const MODEL_PROVIDER = "anthropic"

/** Claude via the AI SDK, configured from server-only environment variables. */
export function investigationModel() {
  const config = anthropicConfig()
  if (!config) return null
  const anthropic = createAnthropic({
    apiKey: config.apiKey,
    baseURL: ANTHROPIC_BASE_URL,
  })
  return { model: anthropic(config.model), modelId: config.model }
}
