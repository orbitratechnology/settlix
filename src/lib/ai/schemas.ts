import { z } from "zod"

/**
 * Structured output Claude must return for an investigation (PRD §10.3). It is
 * advisory: amounts and actions are re-checked by the deterministic eligibility
 * engine, and citations are validated against the stored policy clauses.
 *
 * Bounds are generous on purpose. The AI SDK drops keywords Claude's decoder
 * doesn't support from the request and enforces the full schema on the result.
 */

export const proposedActions = [
  "full_refund",
  "partial_refund",
  "request_evidence",
  "manual_review",
  "not_eligible",
] as const
export type ProposedAction = (typeof proposedActions)[number]

export const factSources = [
  "customer_message",
  "merchant_notes",
  "order_record",
  "payment_record",
  "refund_history",
  "policy",
] as const

export const riskFlagCodes = [
  "prompt_injection",
  "contradictory_claims",
  "possible_fraud",
  "policy_conflict",
  "repeat_requester",
  "high_value",
  "unverified_evidence",
  "other",
] as const
export type RiskFlagCode = (typeof riskFlagCodes)[number]

const text = (max: number) => z.string().trim().min(1).max(max)

export const recommendationSchema = z.object({
  summary: text(1200).describe(
    "Two or three neutral sentences: what the customer asks for and what the records show.",
  ),
  extractedFacts: z
    .array(
      z.object({
        fact: text(400),
        source: z.enum(factSources),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(20)
    .describe(
      "Facts from the case data, each with where it came from. Customer statements stay attributed to the customer.",
    ),
  proposedAction: z.enum(proposedActions),
  proposedAmountMinor: z
    .number()
    .int()
    .nullable()
    .describe(
      "Refund amount in integer minor units (cents) for full_refund or partial_refund; null otherwise.",
    ),
  currencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .describe("ISO 4217 code of proposedAmountMinor; null when no amount."),
  policyCitations: z
    .array(
      z.object({
        policyId: z
          .string()
          .describe("policyId exactly as given in the policy data."),
        policyVersion: z.number().int(),
        clauseKey: z
          .string()
          .describe("clauseKey exactly as given, e.g. FR-1."),
        supportingQuote: text(600).describe(
          "Exact words copied from that clause's content. No paraphrasing.",
        ),
        explanation: text(600).describe(
          "How this clause applies to this case.",
        ),
      }),
    )
    .max(12),
  evidenceFor: z
    .array(text(400))
    .max(12)
    .describe(
      "Evidence in the case data that supports the customer's request.",
    ),
  evidenceMissing: z
    .array(text(400))
    .max(12)
    .describe(
      "Only evidence a cited policy clause requires that is not in the case data.",
    ),
  contradictions: z
    .array(text(400))
    .max(12)
    .describe(
      "Conflicts between the customer's statements, merchant notes, order, payment, or policy records.",
    ),
  riskFlags: z
    .array(z.object({ code: z.enum(riskFlagCodes), detail: text(400) }))
    .max(12),
  explanation: text(2000).describe(
    "Why this action follows from the cited clauses and the facts.",
  ),
  suggestedCustomerReply: text(2000).describe(
    "A short, polite reply to the customer. It must not promise or confirm a refund, give dates, or mention internal checks or risk notes.",
  ),
})

export type ResolutionRecommendation = z.infer<typeof recommendationSchema>

export const isRefundAction = (action: ProposedAction) =>
  action === "full_refund" || action === "partial_refund"
