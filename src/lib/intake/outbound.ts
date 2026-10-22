import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { recordAuditEvent } from "@/lib/audit/events"
import {
  GmailError,
  getGmailConnection,
  sendFromGmail,
} from "@/lib/gmail/client"
import {
  acknowledgementMessage,
  replySubject,
  requestSubject,
  statusUrl,
  withStatusLink,
} from "@/lib/intake/messages"
import { ensureStatusToken } from "@/lib/intake/service"
import { consumeRateLimit } from "@/lib/security/rate-limit"
import type { Database } from "@/types/database"

type Db = SupabaseClient<Database>

export type StoreMessageResult = {
  /** The message is on the customer's status page. */
  posted: true
  /** It was also emailed from the store's Gmail. */
  emailed: boolean
  /** Why the email wasn't sent, when it was asked for. */
  emailError: string | null
  statusUrl: string
  from: string | null
}

/**
 * Sends a message from the store to the customer. It always goes on the
 * customer's status page; with `email`, it is also emailed from the store's
 * Gmail, in the request's thread, with the status link added. A failed email
 * never loses the message: it stays on the status page and the reason is
 * returned.
 */
export async function postStoreMessage(input: {
  admin: Db
  merchantId: string
  caseId: string
  body: string
  author: { type: "user"; id: string } | { type: "system" }
  email: boolean
  origin: string
  subject?: string
  /** Tests pass a Gmail double. */
  fetchImpl?: typeof fetch
}): Promise<StoreMessageResult> {
  const { admin, merchantId, caseId } = input
  const body = input.body.trim().slice(0, 5000)
  if (!body) throw new Error("The message is empty")

  const { data: row, error } = await admin
    .from("cases")
    .select("id, case_number, customer_email, status_token, gmail_thread_id")
    .eq("merchant_id", merchantId)
    .eq("id", caseId)
    .single()
  if (error) throw new Error("Could not load the request", { cause: error })

  const token = await ensureStatusToken(
    admin,
    merchantId,
    row.id,
    row.status_token,
  )
  const link = statusUrl(input.origin, token)

  let sent: { messageId: string; threadId: string; from: string } | null = null
  let emailError: string | null = null
  let subject = input.subject ?? null
  if (input.email) {
    if (!row.customer_email) {
      emailError = "This request has no customer email address."
    } else if (!(await consumeRateLimit(admin, merchantId, "gmail.send"))) {
      emailError =
        "This store has sent many emails in the last hour. Try again later."
    } else {
      // Reply to the customer's latest email in the thread, if Settlix saw one.
      const { data: latest } = row.gmail_thread_id
        ? await admin
            .from("case_messages")
            .select("rfc_message_id, subject")
            .eq("merchant_id", merchantId)
            .eq("case_id", row.id)
            .eq("channel", "gmail")
            .eq("sender", "customer")
            .not("rfc_message_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null }
      subject ??= row.gmail_thread_id
        ? replySubject(row.case_number, latest?.subject)
        : requestSubject(row.case_number)
      try {
        sent = await sendFromGmail(
          admin,
          merchantId,
          {
            to: row.customer_email,
            subject,
            body: withStatusLink(body, link),
            threadId: row.gmail_thread_id,
            inReplyTo: latest?.rfc_message_id ?? null,
          },
          input.fetchImpl,
        )
      } catch (caught) {
        if (!(caught instanceof GmailError)) throw caught
        emailError = caught.message
      }
    }
  }

  const { error: insertError } = await admin.from("case_messages").insert({
    merchant_id: merchantId,
    case_id: row.id,
    sender: input.author.type === "user" ? "merchant" : "settlix",
    channel: sent ? "gmail" : "status_page",
    subject: sent ? subject : null,
    body,
    author_id: input.author.type === "user" ? input.author.id : null,
    gmail_message_id: sent?.messageId ?? null,
    gmail_thread_id: sent?.threadId ?? null,
  })
  if (insertError) {
    throw new Error("Could not save the message", { cause: insertError })
  }

  if (sent && !row.gmail_thread_id) {
    // Later replies from the customer in this thread join the same request.
    await admin
      .from("cases")
      .update({ gmail_thread_id: sent.threadId })
      .eq("merchant_id", merchantId)
      .eq("id", row.id)
      .is("gmail_thread_id", null)
  }

  await recordAuditEvent(admin, {
    merchantId,
    caseId: row.id,
    actor: input.author,
    eventType: "customer.message_sent",
    summary: sent
      ? `Message to the customer emailed from ${sent.from} and posted on their status page.`
      : `Message to the customer posted on their status page${emailError ? " (not emailed)" : ""}.`,
    metadata: {
      emailed: Boolean(sent),
      email_error: emailError,
      length: body.length,
    },
  })

  return {
    posted: true,
    emailed: Boolean(sent),
    emailError,
    statusUrl: link,
    from: sent?.from ?? null,
  }
}

/**
 * Confirms a new request to the customer by email when the store connected
 * Gmail with permission to send, and only to the buyer's verified address, so
 * the public form can never make a store email a stranger.
 */
export async function acknowledgeRequest(input: {
  admin: Db
  merchantId: string
  storeName: string
  caseId: string
  origin: string
}): Promise<void> {
  const { admin, merchantId } = input
  const connection = await getGmailConnection(admin, merchantId)
  if (!connection?.canSend || connection.status !== "active") return

  const { data: row } = await admin
    .from("cases")
    .select(
      "id, case_number, customer_email, customer_display_name, customer_verified, status_token, order:orders!cases_merchant_id_order_id_fkey(external_order_reference)",
    )
    .eq("merchant_id", merchantId)
    .eq("id", input.caseId)
    .maybeSingle()
  if (!row?.customer_email || !row.customer_verified) return

  const token = await ensureStatusToken(
    admin,
    merchantId,
    row.id,
    row.status_token,
  )
  const message = acknowledgementMessage({
    storeName: input.storeName,
    customerName: row.customer_display_name,
    caseNumber: row.case_number,
    orderReference: row.order.external_order_reference,
    statusUrl: statusUrl(input.origin, token),
  })
  await postStoreMessage({
    admin,
    merchantId,
    caseId: row.id,
    body: message.body,
    subject: message.subject,
    author: { type: "system" },
    email: true,
    origin: input.origin,
  })
}
