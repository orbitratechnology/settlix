import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/**
 * Per-merchant limits for endpoints that reach PayPal (PRD §14.5). Each
 * accepted request takes one slot; the window slides.
 */
export const rateLimits = {
  "refund.approve": { limit: 20, windowSeconds: 15 * 60 },
  "refund.reconcile": { limit: 30, windowSeconds: 15 * 60 },
  "checkout.create": { limit: 20, windowSeconds: 15 * 60 },
  "checkout.capture": { limit: 30, windowSeconds: 15 * 60 },
} as const

export type RateLimitedAction = keyof typeof rateLimits

/** Takes a slot for the action; false when the merchant is over the limit. */
export async function consumeRateLimit(
  admin: SupabaseClient<Database>,
  merchantId: string,
  action: RateLimitedAction,
): Promise<boolean> {
  const { limit, windowSeconds } = rateLimits[action]
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_merchant_id: merchantId,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) throw new Error("Could not check the rate limit", { cause: error })
  return data === true
}
