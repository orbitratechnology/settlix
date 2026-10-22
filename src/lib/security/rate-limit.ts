import "server-only"

import { createHash } from "node:crypto"

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
  // Customer intake: public form submissions and replies, per store.
  "request.submit": { limit: 60, windowSeconds: 60 * 60 },
  // Claude checks Settlix starts by itself when requests arrive (cost cap).
  "investigation.auto": { limit: 20, windowSeconds: 60 * 60 },
  // Emails sent from the store's Gmail (replies and acknowledgements).
  "gmail.send": { limit: 60, windowSeconds: 60 * 60 },
  "gmail.sync": { limit: 30, windowSeconds: 60 * 60 },
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

/** Limits for anonymous visitors, keyed by a hash of their IP address. */
export const visitorLimits = {
  "request.submit": { limit: 10, windowSeconds: 60 * 60 },
  "status.reply": { limit: 20, windowSeconds: 60 * 60 },
} as const

/**
 * An opaque per-visitor key: a salted hash of the client IP (Vercel sets
 * x-forwarded-for). The IP itself is never stored.
 */
export function visitorKey(headers: Headers): string {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  return createHash("sha256")
    .update(`settlix-visitor:${ip}`)
    .digest("hex")
    .slice(0, 32)
}

/** Takes a slot for a visitor; false when they are over the limit. */
export async function consumeVisitorLimit(
  admin: SupabaseClient<Database>,
  action: keyof typeof visitorLimits,
  key: string,
): Promise<boolean> {
  const { limit, windowSeconds } = visitorLimits[action]
  const { data, error } = await admin.rpc("consume_keyed_rate_limit", {
    p_key: `${action}:${key}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) throw new Error("Could not check the rate limit", { cause: error })
  return data === true
}
