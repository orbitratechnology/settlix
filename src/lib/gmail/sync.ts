import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { recordAuditEvent } from "@/lib/audit/events"
import type { CaseStatus } from "@/lib/domain/labels"
import {
  GmailError,
  getGmailConnection,
  getGmailMessage,
  gmailAccessToken,
  listGmailMessageIds,
} from "@/lib/gmail/client"
import { parseGmailMessage, type ParsedEmail } from "@/lib/gmail/parse"
import { classifyRequest, summarizeIssue } from "@/lib/intake/classify"
import {
  findReferenceCandidates,
  nameFromEmail,
  normalizeEmail,
} from "@/lib/intake/references"
import { addCustomerMessage } from "@/lib/intake/service"
import { newStatusToken } from "@/lib/intake/tokens"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database, Tables } from "@/types/database"

type Db = SupabaseClient<Database>

/**
 * Gmail's own search does the first filter, so Settlix only ever opens emails
 * that look like refund requests (or replies to its own "Your refund request"
 * emails, whose subject says "refund"). Everything else stays unread by Settlix.
 */
const KEYWORDS = [
  "refund",
  "refunded",
  "return",
  "returned",
  '"money back"',
  "damaged",
  "broken",
  "cracked",
  "defective",
  "faulty",
  '"not received"',
  '"never arrived"',
  '"wrong item"',
  "missing",
]

export function syncQuery(since: Date): string {
  const seconds = Math.floor(since.getTime() / 1000)
  return `in:inbox -from:me after:${seconds} {${KEYWORDS.join(" ")}}`
}

/** How far back the first sync looks, and the overlap between syncs. */
const FIRST_SYNC_DAYS = 7
const OVERLAP_MS = 10 * 60 * 1000
const MAX_MESSAGES = 25
/** A sync that started longer ago than this was interrupted. */
const STALE_SYNC_MS = 3 * 60 * 1000

const PAID_STATES = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] as const
const CLOSED: CaseStatus[] = ["REFUNDED", "NOT_ELIGIBLE"]

export type SyncSummary = {
  status: "synced"
  checked: number
  created: number
  followUps: number
  toSort: number
  /** Requests Settlix should check with Claude and acknowledge. */
  newCaseIds: string[]
  recheckCaseIds: string[]
}

export type SyncResult =
  | SyncSummary
  | { status: "busy" | "not_reading" }
  | { status: "error"; message: string; reconnect: boolean }

type Order = Pick<
  Tables<"orders">,
  | "id"
  | "external_order_reference"
  | "customer_email"
  | "customer_name"
  | "currency_code"
>

const ORDER_COLUMNS =
  "id, external_order_reference, customer_email, customer_name, currency_code" as const

async function ordersForEmail(
  admin: Db,
  merchantId: string,
  parsed: ParsedEmail,
): Promise<{ byReference: Order[]; bySender: Order[] }> {
  const candidates = findReferenceCandidates(
    `${parsed.subject ?? ""}\n${parsed.text}`,
  )
  const paid = () =>
    admin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("merchant_id", merchantId)
      .in("payment_state", [...PAID_STATES])
  const [references, captures, sender] = await Promise.all([
    candidates.length
      ? paid().in("external_order_reference", candidates).limit(5)
      : Promise.resolve({ data: [] as Order[], error: null }),
    candidates.length
      ? paid().in("paypal_capture_id", candidates).limit(5)
      : Promise.resolve({ data: [] as Order[], error: null }),
    paid()
      .ilike("customer_email", parsed.fromEmail.replace(/[\\%_]/g, "\\$&"))
      .order("created_at", { ascending: false })
      .limit(5),
  ])
  const error = references.error ?? captures.error ?? sender.error
  if (error) {
    throw new Error("Could not match the email to an order", { cause: error })
  }
  const byReference = [
    ...(references.data ?? []),
    ...(captures.data ?? []),
  ].filter(
    (order, index, all) => all.findIndex((o) => o.id === order.id) === index,
  )
  return { byReference, bySender: sender.data ?? [] }
}

const sameEmail = (order: Order, email: string) =>
  order.customer_email !== null &&
  normalizeEmail(order.customer_email) === normalizeEmail(email)

async function recordInbound(
  admin: Db,
  merchantId: string,
  parsed: ParsedEmail,
  fields: Pick<
    Database["public"]["Tables"]["inbound_emails"]["Insert"],
    "status" | "case_id" | "suggested_order_id"
  >,
): Promise<boolean> {
  const { error } = await admin.from("inbound_emails").insert({
    merchant_id: merchantId,
    gmail_message_id: parsed.gmailMessageId,
    gmail_thread_id: parsed.threadId,
    rfc_message_id: parsed.rfcMessageId,
    from_email: parsed.fromEmail,
    from_name: parsed.fromName,
    subject: parsed.subject,
    body_text: parsed.text || "(No text)",
    received_at: parsed.receivedAt,
    sender_authenticated: parsed.authenticated,
    ...fields,
  })
  // Another sync stored it first.
  if (error?.code === "23505") return false
  if (error) throw new Error("Could not store the email", { cause: error })
  return true
}

/**
 * Opens a request for an email, linked to its order and Gmail thread. Used by
 * the sync (verified sender) and by the merchant sorting an email by hand.
 */
export async function createCaseFromEmail(
  admin: Db,
  merchantId: string,
  parsed: Pick<
    ParsedEmail,
    "fromEmail" | "fromName" | "subject" | "text" | "threadId"
  >,
  order: Order,
  options: { verified: boolean; createdBy: string | null; linkThread: boolean },
): Promise<{ id: string; case_number: string }> {
  const text = parsed.text || parsed.subject || "(No text)"
  const { data: created, error } = await admin
    .from("cases")
    .insert({
      merchant_id: merchantId,
      order_id: order.id,
      customer_display_name:
        parsed.fromName ||
        order.customer_name ||
        nameFromEmail(parsed.fromEmail),
      customer_email: parsed.fromEmail,
      customer_message: text.slice(0, 5000),
      claimed_issue: summarizeIssue(parsed.subject, text),
      request_category: classifyRequest(`${parsed.subject ?? ""}\n${text}`),
      currency_code: order.currency_code,
      origin: "app",
      channel: "email",
      customer_verified: options.verified,
      status_token: newStatusToken(),
      gmail_thread_id: options.linkThread ? parsed.threadId : null,
      created_by: options.createdBy,
    })
    .select("id, case_number")
    .single()
  if (error) throw new Error("Could not create the request", { cause: error })
  await recordAuditEvent(admin, {
    merchantId,
    caseId: created.id,
    actor: options.createdBy
      ? { type: "user", id: options.createdBy }
      : { type: "system" },
    eventType: "case.created",
    summary: options.createdBy
      ? `Request ${created.case_number} opened from an email in Gmail for order ${order.external_order_reference}.`
      : `Request ${created.case_number} opened from an email in Gmail for order ${order.external_order_reference}. The sender's address matched the order and Gmail verified it.`,
    metadata: {
      channel: "email",
      order_id: order.id,
      verified: options.verified,
    },
  })
  return created
}

/**
 * Brings new refund emails from the store's Gmail into Settlix (PRD intake):
 * replies in a request's thread are added to it, an email from the order's
 * buyer (sender verified by Gmail) opens a request, everything else waits in
 * "Emails to sort". One sync at a time per store; read-only towards Gmail.
 */
export async function syncGmail(
  merchantId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  const admin = createAdminClient()
  const startedAt = new Date()

  const connection = await getGmailConnection(admin, merchantId)
  if (!connection?.canRead) return { status: "not_reading" }
  if (connection.status === "needs_reconnect") {
    return {
      status: "error",
      message: connection.lastError ?? "Reconnect Gmail to continue.",
      reconnect: true,
    }
  }

  const { data: claimed, error: claimError } = await admin
    .from("gmail_connections")
    .update({ sync_started_at: startedAt.toISOString() })
    .eq("merchant_id", merchantId)
    .eq("status", "active")
    .or(
      `sync_started_at.is.null,sync_started_at.lt.${new Date(startedAt.getTime() - STALE_SYNC_MS).toISOString()}`,
    )
    .select("google_email, scopes, last_synced_at")
    .maybeSingle()
  if (claimError)
    throw new Error("Could not start the sync", { cause: claimError })
  if (!claimed) return { status: "busy" }

  const release = (
    fields: Database["public"]["Tables"]["gmail_connections"]["Update"],
  ) =>
    admin
      .from("gmail_connections")
      .update({ sync_started_at: null, ...fields })
      .eq("merchant_id", merchantId)

  try {
    const { token } = await gmailAccessToken(
      admin,
      merchantId,
      "read",
      fetchImpl,
    )
    const since = claimed.last_synced_at
      ? new Date(Date.parse(claimed.last_synced_at) - OVERLAP_MS)
      : new Date(startedAt.getTime() - FIRST_SYNC_DAYS * 86_400_000)
    const listed = await listGmailMessageIds(
      token,
      syncQuery(since),
      MAX_MESSAGES,
      fetchImpl,
    )

    const ids = listed.map((message) => message.id)
    const { data: known, error: knownError } = ids.length
      ? await admin
          .from("inbound_emails")
          .select("gmail_message_id")
          .eq("merchant_id", merchantId)
          .in("gmail_message_id", ids)
      : { data: [], error: null }
    if (knownError)
      throw new Error("Could not read stored emails", { cause: knownError })
    const seen = new Set(known.map((row) => row.gmail_message_id))

    const summary: SyncSummary = {
      status: "synced",
      checked: 0,
      created: 0,
      followUps: 0,
      toSort: 0,
      newCaseIds: [],
      recheckCaseIds: [],
    }
    const own = normalizeEmail(claimed.google_email)

    // Oldest first, so a thread's first email opens the request.
    for (const { id } of [...listed].reverse()) {
      if (seen.has(id)) continue
      const parsed = parseGmailMessage(
        await getGmailMessage(token, id, fetchImpl),
      )
      summary.checked += 1
      if (
        !parsed ||
        parsed.automated ||
        normalizeEmail(parsed.fromEmail) === own
      ) {
        continue
      }

      // 1. A reply in a request's thread joins that request.
      const { data: threadCase } = await admin
        .from("cases")
        .select(
          "id, case_number, status, customer_message, customer_email, order_id",
        )
        .eq("merchant_id", merchantId)
        .eq("gmail_thread_id", parsed.threadId)
        .maybeSingle()
      if (
        threadCase?.customer_email &&
        normalizeEmail(threadCase.customer_email) ===
          normalizeEmail(parsed.fromEmail)
      ) {
        if (
          await recordInbound(admin, merchantId, parsed, {
            status: "follow_up",
            case_id: threadCase.id,
          })
        ) {
          await addCustomerMessage(admin, merchantId, threadCase, {
            body: parsed.text || "(No text)",
            subject: parsed.subject,
            channel: "gmail",
            source: "email",
            gmail: {
              messageId: parsed.gmailMessageId,
              threadId: parsed.threadId,
              rfcMessageId: parsed.rfcMessageId,
            },
          })
          summary.followUps += 1
          if (threadCase.status === "NEEDS_EVIDENCE") {
            summary.recheckCaseIds.push(threadCase.id)
          }
        }
        continue
      }

      // 2. An email from the order's buyer, verified by Gmail, opens a request
      //    (or joins the order's open one).
      const { byReference, bySender } = await ordersForEmail(
        admin,
        merchantId,
        parsed,
      )
      const chosen = byReference.length
        ? (byReference.find((order) => sameEmail(order, parsed.fromEmail)) ??
          null)
        : bySender.length === 1
          ? bySender[0]
          : null
      const suggested = threadCase
        ? null
        : (byReference[0] ?? bySender[0] ?? null)

      if (chosen && parsed.authenticated && !threadCase) {
        const { data: open } = await admin
          .from("cases")
          .select("id, case_number, status, customer_message, gmail_thread_id")
          .eq("merchant_id", merchantId)
          .eq("order_id", chosen.id)
          .not("status", "in", `(${CLOSED.join(",")})`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (open) {
          if (
            await recordInbound(admin, merchantId, parsed, {
              status: "follow_up",
              case_id: open.id,
              suggested_order_id: chosen.id,
            })
          ) {
            await addCustomerMessage(admin, merchantId, open, {
              body: parsed.text || "(No text)",
              subject: parsed.subject,
              channel: "gmail",
              source: "email",
              gmail: {
                messageId: parsed.gmailMessageId,
                threadId: parsed.threadId,
                rfcMessageId: parsed.rfcMessageId,
              },
            })
            if (!open.gmail_thread_id) {
              // Ignore a clash: the thread may already belong to another request.
              await admin
                .from("cases")
                .update({ gmail_thread_id: parsed.threadId })
                .eq("merchant_id", merchantId)
                .eq("id", open.id)
                .is("gmail_thread_id", null)
            }
            summary.followUps += 1
            if (open.status === "NEEDS_EVIDENCE")
              summary.recheckCaseIds.push(open.id)
          }
          continue
        }

        const created = await createCaseFromEmail(
          admin,
          merchantId,
          parsed,
          chosen,
          {
            verified: true,
            createdBy: null,
            linkThread: true,
          },
        )
        const stored = await recordInbound(admin, merchantId, parsed, {
          status: "case_created",
          case_id: created.id,
          suggested_order_id: chosen.id,
        })
        const { error: messageError } = await admin
          .from("case_messages")
          .insert({
            merchant_id: merchantId,
            case_id: created.id,
            sender: "customer",
            channel: "gmail",
            subject: parsed.subject,
            body: (parsed.text || "(No text)").slice(0, 5000),
            gmail_message_id: parsed.gmailMessageId,
            gmail_thread_id: parsed.threadId,
            rfc_message_id: parsed.rfcMessageId,
          })
        if (messageError && messageError.code !== "23505") {
          throw new Error("Could not save the email", { cause: messageError })
        }
        if (stored) {
          summary.created += 1
          summary.newCaseIds.push(created.id)
        }
        continue
      }

      // 3. Everything else waits for the merchant.
      if (
        await recordInbound(admin, merchantId, parsed, {
          status: "to_sort",
          suggested_order_id: suggested?.id ?? threadCase?.order_id ?? null,
        })
      ) {
        summary.toSort += 1
      }
    }

    await release({ last_synced_at: startedAt.toISOString(), last_error: null })
    if (summary.created || summary.followUps || summary.toSort) {
      await recordAuditEvent(admin, {
        merchantId,
        actor: { type: "system" },
        eventType: "gmail.synced",
        summary: `Gmail checked: ${summary.created} new request${summary.created === 1 ? "" : "s"}, ${summary.followUps} repl${summary.followUps === 1 ? "y" : "ies"} added, ${summary.toSort} to sort.`,
        metadata: {
          checked: summary.checked,
          created: summary.created,
          follow_ups: summary.followUps,
          to_sort: summary.toSort,
        },
      })
    }
    return summary
  } catch (caught) {
    if (caught instanceof GmailError) {
      await release(
        caught.kind === "missing_permission"
          ? { last_error: caught.message }
          : caught.kind === "needs_reconnect"
            ? {}
            : { last_error: caught.message },
      )
      if (caught.kind === "missing_permission") return { status: "not_reading" }
      return {
        status: "error",
        message: caught.message,
        reconnect: caught.kind === "needs_reconnect",
      }
    }
    await release({ last_error: "The last Gmail check failed. Try again." })
    throw caught
  }
}
