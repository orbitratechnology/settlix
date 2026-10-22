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

export type ClaudeConnection =
  | { ok: true }
  | {
      ok: false
      reason:
        "not_configured" | "key_rejected" | "model_not_found" | "unreachable"
    }

/**
 * Confirms the key and model ID with Anthropic's model lookup, which costs no
 * tokens. Only the outcome is returned, never the key or the response body.
 */
export async function checkClaudeConnection(): Promise<ClaudeConnection> {
  const config = anthropicConfig()
  if (!config) return { ok: false, reason: "not_configured" }
  try {
    const response = await fetch(
      `${ANTHROPIC_BASE_URL}/models/${encodeURIComponent(config.model)}`,
      {
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (response.ok) return { ok: true }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "key_rejected" }
    }
    if (response.status === 404) return { ok: false, reason: "model_not_found" }
    return { ok: false, reason: "unreachable" }
  } catch {
    return { ok: false, reason: "unreachable" }
  }
}
