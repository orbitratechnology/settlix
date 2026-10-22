"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { z } from "zod"

import { recordAuditEvent } from "@/lib/audit/events"
import { createCaseFromEmail } from "@/lib/gmail/sync"
import { acknowledgeRequest } from "@/lib/intake/outbound"
import { normalizeEmail } from "@/lib/intake/references"
import { autoCheckRequest } from "@/lib/intake/service"
import { can, requireMember } from "@/lib/security/auth"
import { siteOrigin } from "@/lib/site"
import { createAdminClient } from "@/lib/supabase/admin"

export type SortState = { error?: string }

const ids = z.object({ emailId: z.uuid(), orderId: z.uuid() })

/**
 * Opens a request from an email the merchant matched to an order by hand. The
 * customer counts as verified only if Gmail verified the sender and it is the
 * order's buyer; only then may Settlix email them a confirmation.
 */
export async function openRequestFromEmail(
  emailId: string,
  _previous: SortState,
  formData: FormData,
): Promise<SortState> {
  const member = await requireMember()
  if (!can.createCases(member.role)) {
    return { error: "Your role can't open requests." }
  }
  const parsed = ids.safeParse({ emailId, orderId: formData.get("orderId") })
  if (!parsed.success) return { error: "Choose the order this email is about." }

  const admin = createAdminClient()
  const merchantId = member.workspace.id
  const [
    { data: email, error: emailError },
    { data: order, error: orderError },
  ] = await Promise.all([
    admin
      .from("inbound_emails")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("id", parsed.data.emailId)
      .eq("status", "to_sort")
      .maybeSingle(),
    admin
      .from("orders")
      .select(
        "id, external_order_reference, customer_email, customer_name, currency_code",
      )
      .eq("merchant_id", merchantId)
      .eq("id", parsed.data.orderId)
      .in("payment_state", ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"])
      .maybeSingle(),
  ])
  if (emailError || orderError) {
    throw new Error("Could not load the email or order", {
      cause: emailError ?? orderError,
    })
  }
  if (!email) return { error: "This email was already sorted." }
  if (!order) return { error: "That order isn't a paid order of this store." }

  const { data: threadCase } = await admin
    .from("cases")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("gmail_thread_id", email.gmail_thread_id)
    .maybeSingle()
  const verified =
    email.sender_authenticated &&
    order.customer_email !== null &&
    normalizeEmail(order.customer_email) === normalizeEmail(email.from_email)

  const created = await createCaseFromEmail(
    admin,
    merchantId,
    {
      fromEmail: email.from_email,
      fromName: email.from_name,
      subject: email.subject,
      text: email.body_text,
      threadId: email.gmail_thread_id,
    },
    order,
    { verified, createdBy: member.userId, linkThread: !threadCase },
  )
  const { error: messageError } = await admin.from("case_messages").insert({
    merchant_id: merchantId,
    case_id: created.id,
    sender: "customer",
    channel: "gmail",
    subject: email.subject,
    body: email.body_text,
    gmail_message_id: email.gmail_message_id,
    gmail_thread_id: email.gmail_thread_id,
    rfc_message_id: email.rfc_message_id,
  })
  if (messageError && messageError.code !== "23505") {
    throw new Error("Could not save the email", { cause: messageError })
  }
  await admin
    .from("inbound_emails")
    .update({ status: "case_created", case_id: created.id })
    .eq("merchant_id", merchantId)
    .eq("id", email.id)

  const [{ data: store }, origin] = await Promise.all([
    admin
      .from("merchants")
      .select("auto_check_requests")
      .eq("id", merchantId)
      .single(),
    siteOrigin(),
  ])
  after(async () => {
    if (verified) {
      await acknowledgeRequest({
        admin: createAdminClient(),
        merchantId,
        storeName: member.workspace.name,
        caseId: created.id,
        origin,
      }).catch(() =>
        console.error("Could not acknowledge", { caseId: created.id }),
      )
    }
    if (store?.auto_check_requests) {
      await autoCheckRequest(merchantId, created.id).catch(() =>
        console.error("Automatic check failed", { caseId: created.id }),
      )
    }
  })
  redirect(`/cases/${created.id}`)
}

/** "Not a refund request": the email leaves the list; Gmail is untouched. */
export async function dismissEmail(emailId: string): Promise<SortState> {
  const member = await requireMember()
  if (!can.createCases(member.role))
    return { error: "Your role can't do this." }
  if (!z.uuid().safeParse(emailId).success) return { error: "Email not found." }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("inbound_emails")
    .update({ status: "dismissed" })
    .eq("merchant_id", member.workspace.id)
    .eq("id", emailId)
    .eq("status", "to_sort")
    .select("from_email")
    .maybeSingle()
  if (error) throw new Error("Could not update the email", { cause: error })
  if (data) {
    await recordAuditEvent(admin, {
      merchantId: member.workspace.id,
      actor: { type: "user", id: member.userId },
      eventType: "gmail.email_dismissed",
      summary: "An email from Gmail was marked as not a refund request.",
    })
  }
  refresh()
  return {}
}
