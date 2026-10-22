"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { recordAuditEvent } from "@/lib/audit/events"
import {
  caseActionAllowed,
  caseActionTarget,
  type CaseAction,
} from "@/lib/cases/actions"
import { caseStatusMeta } from "@/lib/domain/labels"
import { formatDateTime } from "@/lib/format"
import { postStoreMessage } from "@/lib/intake/outbound"
import { can, requireMember } from "@/lib/security/auth"
import { siteOrigin } from "@/lib/site"
import { createAdminClient } from "@/lib/supabase/admin"

export type CaseActionState = {
  error?: string
  done?: boolean
  /** Set when the message also went to the customer. */
  notice?: string
}

const MAX_NOTES = 5000

const textSchema = z
  .string()
  .trim()
  .min(1, "Write something first.")
  .max(1000, "Keep it under 1,000 characters.")

const auditTypes: Record<Exclude<CaseAction, "note">, string> = {
  requestEvidence: "case.evidence_requested",
  sendToReview: "case.sent_to_review",
  decline: "case.declined",
}

const auditSummaries: Record<Exclude<CaseAction, "note">, string> = {
  requestEvidence: "Evidence requested from the customer",
  sendToReview: "Sent to manual review",
  decline: "Declined without a refund",
}

async function loadForAction(caseId: string) {
  if (!z.uuid().safeParse(caseId).success) return null
  const member = await requireMember()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("cases")
    .select("id, case_number, status, supporting_details")
    .eq("merchant_id", member.workspace.id)
    .eq("id", caseId)
    .maybeSingle()
  if (error) throw new Error("Could not load the case", { cause: error })
  return data ? { member, admin, row: data } : null
}

/**
 * Adds a merchant note (e.g. "photo received in the help desk"). Notes are part
 * of the evidence an investigation reads, so the current recommendation becomes
 * stale and should be re-run.
 */
export async function addCaseNote(
  caseId: string,
  _previous: CaseActionState,
  formData: FormData,
): Promise<CaseActionState> {
  const loaded = await loadForAction(caseId)
  if (!loaded) return { error: "Case not found." }
  const { member, admin, row } = loaded
  if (!caseActionAllowed("note", row.status, member.role)) {
    return { error: "Notes can't be added to this case right now." }
  }
  const parsed = textSchema.safeParse(formData.get("text"))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const entry = `[Note added ${formatDateTime(new Date())}] ${parsed.data}`
  const notes = row.supporting_details
    ? `${row.supporting_details}\n\n${entry}`
    : entry
  if (notes.length > MAX_NOTES) {
    return { error: "This case has reached the 5,000-character note limit." }
  }

  const { data: updated, error } = await admin
    .from("cases")
    .update({ supporting_details: notes })
    .eq("merchant_id", member.workspace.id)
    .eq("id", row.id)
    .eq("status", row.status)
    .select("id")
    .maybeSingle()
  if (error) throw new Error("Could not save the note", { cause: error })
  if (!updated) return { error: "The case changed. Refresh and try again." }

  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    caseId: row.id,
    actor: { type: "user", id: member.userId },
    eventType: "case.note_added",
    summary: `Merchant note added: ${parsed.data}`,
    metadata: { length: parsed.data.length },
  })
  refresh()
  return { done: true }
}

async function transition(
  action: Exclude<CaseAction, "note">,
  caseId: string,
  formData: FormData,
): Promise<CaseActionState> {
  const loaded = await loadForAction(caseId)
  if (!loaded) return { error: "Case not found." }
  const { member, admin, row } = loaded
  if (!caseActionAllowed(action, row.status, member.role)) {
    return {
      error: `This isn't available for a case that is "${caseStatusMeta[row.status].label}".`,
    }
  }
  const parsed = textSchema.safeParse(formData.get("text"))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const target = caseActionTarget[action]
  const { data: updated, error } = await admin
    .from("cases")
    .update({ status: target })
    .eq("merchant_id", member.workspace.id)
    .eq("id", row.id)
    .eq("status", row.status)
    .select("id")
    .maybeSingle()
  if (error) throw new Error("Could not update the case", { cause: error })
  if (!updated) return { error: "The case changed. Refresh and try again." }

  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    caseId: row.id,
    actor: { type: "user", id: member.userId },
    eventType: auditTypes[action],
    summary: `${auditSummaries[action]}: ${parsed.data}`,
    metadata: { from_status: row.status, to_status: target },
  })

  // "Ask the customer for more" can send the text to the customer as well.
  let notice: string | undefined
  if (
    action === "requestEvidence" &&
    formData.get("notify") === "on" &&
    can.messageCustomers(member.role)
  ) {
    const sent = await postStoreMessage({
      admin,
      merchantId: member.workspace.id,
      caseId: row.id,
      body: parsed.data,
      author: { type: "user", id: member.userId },
      email: formData.get("email") === "on",
      origin: await siteOrigin(),
    })
    notice = sent.emailed
      ? "Sent to the customer by email and on their request page."
      : sent.emailError
        ? `Posted on the customer's request page. Not emailed: ${sent.emailError}`
        : "Posted on the customer's request page."
  }
  refresh()
  return { done: true, notice }
}

const messageSchema = z
  .string()
  .trim()
  .min(1, "Write the message first.")
  .max(5000, "Keep it under 5,000 characters.")

export type MessageState = {
  error?: string
  sent?: { emailed: boolean; emailError: string | null; at: number }
  /** For "open in email app": the status link to include. */
  statusUrl?: string
}

/**
 * A message from the store to the customer: always on the customer's request
 * page; emailed from the store's Gmail when `delivery` is "gmail".
 */
export async function sendCustomerMessage(
  caseId: string,
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const loaded = await loadForAction(caseId)
  if (!loaded) return { error: "Request not found." }
  const { member, admin, row } = loaded
  if (!can.messageCustomers(member.role)) {
    return { error: "Your role can't message customers." }
  }
  const parsed = messageSchema.safeParse(formData.get("text"))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const result = await postStoreMessage({
    admin,
    merchantId: member.workspace.id,
    caseId: row.id,
    body: parsed.data,
    author: { type: "user", id: member.userId },
    email: formData.get("delivery") === "gmail",
    origin: await siteOrigin(),
  })
  refresh()
  return {
    sent: {
      emailed: result.emailed,
      emailError: result.emailError,
      at: Date.now(),
    },
    statusUrl: result.statusUrl,
  }
}

/** Records what evidence was asked for, and can send it to the customer. */
export async function requestEvidence(
  caseId: string,
  _previous: CaseActionState,
  formData: FormData,
) {
  return transition("requestEvidence", caseId, formData)
}

export async function sendToReview(
  caseId: string,
  _previous: CaseActionState,
  formData: FormData,
) {
  return transition("sendToReview", caseId, formData)
}

/** Closes the case without a refund. Reviewers and above only. */
export async function declineCase(
  caseId: string,
  _previous: CaseActionState,
  formData: FormData,
) {
  return transition("decline", caseId, formData)
}
