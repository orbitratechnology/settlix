import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { recordAuditEvent } from "@/lib/audit/events"
import type { CaseStatus, RequestCategory } from "@/lib/domain/labels"
import { anthropicConfig } from "@/lib/env/server"
import { summarizeIssue } from "@/lib/intake/classify"
import {
  appendCustomerText,
  type CustomerTextSource,
} from "@/lib/intake/customer-text"
import {
  ilikeExact,
  nameFromEmail,
  normalizeEmail,
  normalizeOrderReference,
} from "@/lib/intake/references"
import { newStatusToken } from "@/lib/intake/tokens"
import { runInvestigation } from "@/lib/investigations/service"
import { payPalToMinor } from "@/lib/paypal/money"
import {
  consumeRateLimit,
  consumeVisitorLimit,
} from "@/lib/security/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database, Enums, Tables } from "@/types/database"

type Db = SupabaseClient<Database>

export type PublicStore = {
  id: string
  name: string
  slug: string
  isDemo: boolean
  formEnabled: boolean
  autoCheck: boolean
  currency: string
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** The store behind a public form link: only what the public pages may show. */
export async function findPublicStore(
  slug: string,
): Promise<PublicStore | null> {
  if (!SLUG.test(slug) || slug.length > 80) return null
  const { data, error } = await createAdminClient()
    .from("merchants")
    .select(
      "id, name, slug, is_demo, request_form_enabled, auto_check_requests, default_currency",
    )
    .eq("slug", slug)
    .maybeSingle()
  if (error) throw new Error("Could not load the store", { cause: error })
  if (!data) return null
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    isDemo: data.is_demo,
    formEnabled: data.request_form_enabled,
    autoCheck: data.auto_check_requests,
    currency: data.default_currency,
  }
}

/** Payments a customer can ask about (a refund needs money that was paid). */
const PAID_STATES: Enums<"order_payment_state">[] = [
  "CAPTURED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]

/** Requests that are finished; a new message for the order opens a new one. */
const CLOSED_STATUSES: CaseStatus[] = ["REFUNDED", "NOT_ELIGIBLE"]

export type MatchedOrder = Pick<
  Tables<"orders">,
  | "id"
  | "external_order_reference"
  | "description"
  | "original_amount_minor"
  | "currency_code"
  | "customer_email"
  | "customer_name"
  | "origin"
>

const ORDER_COLUMNS =
  "id, external_order_reference, description, original_amount_minor, currency_code, customer_email, customer_name, origin" as const

/**
 * The merchant's paid order for what the customer typed (order number or
 * PayPal transaction ID), only if the email is the buyer's. Unknown order,
 * unpaid order and wrong email all look the same to the caller.
 */
export async function matchOrder(
  admin: Db,
  merchantId: string,
  reference: string,
  email: string,
): Promise<MatchedOrder | null> {
  const normalized = normalizeOrderReference(reference)
  if (!normalized) return null
  const base = () =>
    admin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("merchant_id", merchantId)
      .in("payment_state", PAID_STATES)
      .limit(2)
  const [byReference, byTransaction] = await Promise.all([
    base().ilike("external_order_reference", ilikeExact(normalized)),
    base().eq("paypal_capture_id", normalized),
  ])
  if (byReference.error || byTransaction.error) {
    throw new Error("Could not look up the order", {
      cause: byReference.error ?? byTransaction.error,
    })
  }
  const wanted = normalizeEmail(email)
  return (
    [...byReference.data, ...byTransaction.data].find(
      (order) =>
        order.customer_email !== null &&
        normalizeEmail(order.customer_email) === wanted,
    ) ?? null
  )
}

/** Gives the request a status-page token if it has none (e.g. made in the dashboard). */
export async function ensureStatusToken(
  admin: Db,
  merchantId: string,
  caseId: string,
  current: string | null,
): Promise<string> {
  if (current) return current
  const { data, error } = await admin
    .from("cases")
    .update({ status_token: newStatusToken() })
    .eq("merchant_id", merchantId)
    .eq("id", caseId)
    .is("status_token", null)
    .select("status_token")
    .maybeSingle()
  if (error) throw new Error("Could not create the status link", { cause: error })
  if (data?.status_token) return data.status_token
  // Another request set it first.
  const { data: row, error: reloadError } = await admin
    .from("cases")
    .select("status_token")
    .eq("merchant_id", merchantId)
    .eq("id", caseId)
    .single()
  if (reloadError || !row.status_token) {
    throw new Error("Could not read the status link", { cause: reloadError })
  }
  return row.status_token
}

type CaseForMessage = {
  id: string
  case_number: string
  status: CaseStatus
  customer_message: string
}

/**
 * Records something the customer sent after the request was opened: kept in
 * full in the conversation, and added to the request text Claude reads.
 */
export async function addCustomerMessage(
  admin: Db,
  merchantId: string,
  row: CaseForMessage,
  message: {
    body: string
    channel: Enums<"message_channel">
    source: CustomerTextSource
    subject?: string | null
    gmail?: { messageId: string; threadId: string; rfcMessageId: string | null }
  },
): Promise<void> {
  const body = message.body.trim().slice(0, 5000)
  if (!body) return
  const { error: messageError } = await admin.from("case_messages").insert({
    merchant_id: merchantId,
    case_id: row.id,
    sender: "customer",
    channel: message.channel,
    subject: message.subject?.slice(0, 300) || null,
    body,
    gmail_message_id: message.gmail?.messageId ?? null,
    gmail_thread_id: message.gmail?.threadId ?? null,
    rfc_message_id: message.gmail?.rfcMessageId ?? null,
  })
  if (messageError) {
    throw new Error("Could not save the customer's message", {
      cause: messageError,
    })
  }

  // Optimistic update: retry once if the text changed in between.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current =
      attempt === 0
        ? row.customer_message
        : (
            await admin
              .from("cases")
              .select("customer_message")
              .eq("merchant_id", merchantId)
              .eq("id", row.id)
              .single()
          ).data?.customer_message
    if (current === undefined) break
    const next = appendCustomerText(current, body, message.source, new Date())
    if (!next) break
    const { data: updated, error } = await admin
      .from("cases")
      .update({ customer_message: next })
      .eq("merchant_id", merchantId)
      .eq("id", row.id)
      .eq("customer_message", current)
      .select("id")
      .maybeSingle()
    if (error) throw new Error("Could not update the request", { cause: error })
    if (updated) break
  }

  await recordAuditEvent(admin, {
    merchantId,
    caseId: row.id,
    actor: { type: "system" },
    eventType: "customer.message_received",
    summary: `The customer added information through ${message.source}.`,
    metadata: { channel: message.channel, length: body.length },
  })
}

/** Requests Claude checks again by itself when new information arrives. */
const AUTO_CHECK_STATUSES: CaseStatus[] = ["NEW", "NEEDS_EVIDENCE"]

/**
 * Settlix's automatic Claude check of a request that just arrived or just got
 * new information. Capped per store per hour; when Claude isn't configured or
 * the cap is reached, the request simply waits for the merchant.
 */
export async function autoCheckRequest(
  merchantId: string,
  caseId: string,
): Promise<void> {
  if (!anthropicConfig()) return
  const admin = createAdminClient()
  const { data: row } = await admin
    .from("cases")
    .select("status")
    .eq("merchant_id", merchantId)
    .eq("id", caseId)
    .maybeSingle()
  if (!row || !AUTO_CHECK_STATUSES.includes(row.status)) return
  if (!(await consumeRateLimit(admin, merchantId, "investigation.auto"))) {
    await recordAuditEvent(admin, {
      merchantId,
      caseId,
      actor: { type: "system" },
      eventType: "investigation.auto_skipped",
      summary:
        "Not checked automatically: this store reached its hourly limit of automatic checks.",
    })
    return
  }
  await runInvestigation({ merchantId, caseId, actor: { type: "system" } })
}

export type PublicRequestInput = {
  reference: string
  email: string
  name: string | null
  category: RequestCategory
  details: string
  amount: string | null
  via: string | null
}

export type PublicRequestResult =
  | {
      status: "created" | "added"
      caseId: string
      caseNumber: string
      statusToken: string
      /** Settlix should check it now (new request, or new information it waited for). */
      check: boolean
    }
  | { status: "no_match" }
  | { status: "invalid_amount"; message: string }
  | { status: "rate_limited" }

/**
 * A refund request from the public form. It opens a request only for one of the
 * store's paid orders, and only when the email is the buyer's. A second message
 * about an order with an open request is added to that request instead.
 */
export async function submitPublicRequest(
  store: PublicStore,
  input: PublicRequestInput,
  visitor: string,
): Promise<PublicRequestResult> {
  const admin = createAdminClient()
  if (
    !(await consumeVisitorLimit(admin, "request.submit", visitor)) ||
    !(await consumeRateLimit(admin, store.id, "request.submit"))
  ) {
    return { status: "rate_limited" }
  }

  const order = await matchOrder(admin, store.id, input.reference, input.email)
  if (!order) return { status: "no_match" }

  let requestedAmountMinor: number | null = null
  if (input.amount) {
    try {
      requestedAmountMinor = payPalToMinor({
        currency_code: order.currency_code,
        value: input.amount,
      })
    } catch {
      return { status: "invalid_amount", message: "Use an amount like 12.50." }
    }
    if (requestedAmountMinor <= 0) {
      return { status: "invalid_amount", message: "Enter an amount above zero." }
    }
    if (requestedAmountMinor > order.original_amount_minor) {
      return {
        status: "invalid_amount",
        message: "That's more than you paid for this order.",
      }
    }
  }

  const email = normalizeEmail(input.email)
  const details = input.details.trim()

  // Demo stores always open a new request, so every visitor can try the flow.
  if (!store.isDemo) {
    const { data: open, error } = await admin
      .from("cases")
      .select("id, case_number, status, customer_message, status_token")
      .eq("merchant_id", store.id)
      .eq("order_id", order.id)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error("Could not look up requests", { cause: error })
    if (open) {
      await addCustomerMessage(admin, store.id, open, {
        body: details,
        channel: "form",
        source: "the request form",
      })
      return {
        status: "added",
        caseId: open.id,
        caseNumber: open.case_number,
        statusToken: await ensureStatusToken(
          admin,
          store.id,
          open.id,
          open.status_token,
        ),
        check: open.status === "NEEDS_EVIDENCE",
      }
    }
  }

  const statusToken = newStatusToken()
  const { data: created, error: createError } = await admin
    .from("cases")
    .insert({
      merchant_id: store.id,
      order_id: order.id,
      customer_display_name:
        input.name?.trim().slice(0, 120) ||
        order.customer_name ||
        nameFromEmail(email),
      customer_email: email,
      customer_message: details,
      claimed_issue: summarizeIssue(null, details),
      request_category: input.category,
      requested_amount_minor: requestedAmountMinor,
      currency_code: order.currency_code,
      origin: "app",
      channel: "form",
      channel_source: input.via,
      customer_verified: true,
      status_token: statusToken,
    })
    .select("id, case_number")
    .single()
  if (createError) {
    throw new Error("Could not create the request", { cause: createError })
  }

  const { error: messageError } = await admin.from("case_messages").insert({
    merchant_id: store.id,
    case_id: created.id,
    sender: "customer",
    channel: "form",
    body: details,
  })
  if (messageError) {
    throw new Error("Could not save the request", { cause: messageError })
  }

  await recordAuditEvent(admin, {
    merchantId: store.id,
    caseId: created.id,
    actor: { type: "system" },
    eventType: "case.created",
    summary: `Request ${created.case_number} sent by the customer through the request form for order ${order.external_order_reference}. The order number and email matched.`,
    metadata: {
      channel: "form",
      via: input.via,
      order_id: order.id,
      requested_amount_minor: requestedAmountMinor,
    },
  })

  return {
    status: "created",
    caseId: created.id,
    caseNumber: created.case_number,
    statusToken,
    check: true,
  }
}
