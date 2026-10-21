import "server-only"

import {
  APICallError,
  generateText,
  JSONParseError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
  TypeValidationError,
  type LanguageModel,
} from "ai"

import {
  INVESTIGATION_SYSTEM_PROMPT,
  buildInvestigationPrompt,
} from "@/lib/ai/prompts"
import {
  recommendationSchema,
  type ResolutionRecommendation,
} from "@/lib/ai/schemas"
import type { CaseStatus } from "@/lib/domain/labels"
import type { InvestigationContext } from "@/lib/investigations/context"

/** Total budget for one investigation, including the SDK's retries. */
export const INVESTIGATION_TIMEOUT_MS = 75_000
/** Larger prompts are rejected before calling the model (PRD §14.5). */
export const MAX_PROMPT_CHARS = 60_000

export type AiFailureKind =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "invalid_output"
  | "refused"
  | "context_too_large"

export class InvestigationAiError extends Error {
  readonly kind: AiFailureKind
  /** Provider status code, when there was one. Never contains secrets. */
  readonly statusCode: number | null

  constructor(kind: AiFailureKind, statusCode: number | null = null) {
    super(aiFailureMessages[kind])
    this.name = "InvestigationAiError"
    this.kind = kind
    this.statusCode = statusCode
  }
}

export const aiFailureMessages: Record<AiFailureKind, string> = {
  not_configured:
    "Claude isn't configured. Add ANTHROPIC_API_KEY and ANTHROPIC_MODEL to the server environment.",
  timeout: "Claude didn't respond in time. The case is unchanged; try again.",
  rate_limited:
    "Claude is rate limited right now. Wait a minute, then try again.",
  provider_error:
    "Claude couldn't be reached. The case is unchanged; try again shortly.",
  invalid_output:
    "Claude returned an incomplete or invalid recommendation, so it was discarded. Try again.",
  refused:
    "Claude declined to assess this case. A merchant should review it manually.",
  context_too_large:
    "This case has too much text to investigate. Shorten the merchant notes or policy text.",
}

export type ModelRun = {
  recommendation: ResolutionRecommendation
  /** Model that actually answered, as reported by the provider. */
  modelId: string
  usage: { inputTokens: number | null; outputTokens: number | null }
}

/**
 * One Claude call with structured output. The result is schema-validated by
 * the AI SDK; citations and eligibility are checked by the caller. The model
 * gets no tools: it can only read the context it is given.
 */
export async function runInvestigationModel({
  model,
  context,
  caseStatus,
}: {
  model: LanguageModel
  context: InvestigationContext
  caseStatus: CaseStatus
}): Promise<ModelRun> {
  const prompt = buildInvestigationPrompt(context, caseStatus)
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new InvestigationAiError("context_too_large")
  }

  try {
    const result = await generateText({
      model,
      system: INVESTIGATION_SYSTEM_PROMPT,
      prompt,
      output: Output.object({
        name: "resolution_recommendation",
        schema: recommendationSchema,
      }),
      maxOutputTokens: 16_000,
      timeout: { totalMs: INVESTIGATION_TIMEOUT_MS },
    })
    if (result.finishReason === "content-filter") {
      throw new InvestigationAiError("refused")
    }
    return {
      recommendation: result.output,
      modelId: result.response.modelId,
      usage: {
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
      },
    }
  } catch (error) {
    throw toInvestigationAiError(error)
  }
}

export function toInvestigationAiError(error: unknown): InvestigationAiError {
  if (error instanceof InvestigationAiError) return error
  if (RetryError.isInstance(error)) {
    return toInvestigationAiError(error.lastError)
  }
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new InvestigationAiError("timeout")
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    return new InvestigationAiError(
      error.finishReason === "content-filter" ? "refused" : "invalid_output",
    )
  }
  if (
    NoOutputGeneratedError.isInstance(error) ||
    TypeValidationError.isInstance(error) ||
    JSONParseError.isInstance(error)
  ) {
    return new InvestigationAiError("invalid_output")
  }
  if (LoadAPIKeyError.isInstance(error)) {
    return new InvestigationAiError("not_configured")
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? null
    if (status === 429) return new InvestigationAiError("rate_limited", status)
    if (status === 401 || status === 403) {
      return new InvestigationAiError("not_configured", status)
    }
    if (status === 413) {
      return new InvestigationAiError("context_too_large", status)
    }
    return new InvestigationAiError("provider_error", status)
  }
  return new InvestigationAiError("provider_error")
}
