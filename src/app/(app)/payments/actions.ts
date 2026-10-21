"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { recordAuditEvent } from "@/lib/audit/events"
import { Constants } from "@/types/database"
import {
  refreshSandboxPayment,
  type CheckoutOutcome,
} from "@/lib/payments/checkout"
import { payPalToMinor } from "@/lib/paypal/money"
import { can, requireMember } from "@/lib/security/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export type CreateCaseState = {
  error?: string
  fieldErrors?: Partial<Record<string, string>>
}

const caseSchema = z.object({
  orderId: z.uuid(),
  customerDisplayName: z
    .string()
    .trim()
    .min(1, "Enter the customer's name.")
    .max(120),
  customerEmail: z
    .union([z.literal(""), z.email("Enter a valid email address.").max(254)])
    .optional(),
  requestCategory: z.enum(Constants.public.Enums.request_category, {
    error: "Choose a category.",
  }),
  claimedIssue: z.string().trim().min(1, "Summarize the issue.").max(300),
  customerMessage: z
    .string()
    .trim()
    .min(1, "Paste the customer's message.")
    .max(5000),
  requestedAmount: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\d+(\.\d{1,2})?)?$/, "Use an amount like 12.50.")
    .optional(),
  supportingDetails: z.string().trim().max(5000).optional(),
})

/**
 * FR-04: opens a refund case for a captured sandbox payment that belongs to the
 * member's merchant. The order mapping, currency, and amount ceiling come from
 * the database, never from the form.
 */
export async function createCaseFromPayment(
  _previous: CreateCaseState,
  formData: FormData,
): Promise<CreateCaseState> {
  const member = await requireMember()
  if (!can.createCases(member.role)) {
    return { error: "Your role can't open refund cases." }
  }

  const parsed = caseSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form")
      fieldErrors[key] ??= issue.message
    }
    return { error: "Check the highlighted fields.", fieldErrors }
  }
  const input = parsed.data

  const admin = createAdminClient()
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("*")
    .eq("merchant_id", member.workspace.id)
    .eq("id", input.orderId)
    .maybeSingle()
  if (orderError)
    throw new Error("Could not load the order", { cause: orderError })
  if (!order) return { error: "Payment not found." }

  const refundable =
    order.origin === "app" &&
    Boolean(order.paypal_capture_id) &&
    (order.payment_state === "CAPTURED" ||
      order.payment_state === "PARTIALLY_REFUNDED")
  if (!refundable) {
    return {
      error:
        "This payment isn't a completed PayPal Sandbox capture, so a refund case can't be opened for it.",
    }
  }

  let requestedAmountMinor: number | null = null
  if (input.requestedAmount) {
    try {
      requestedAmountMinor = payPalToMinor({
        currency_code: order.currency_code,
        value: input.requestedAmount,
      })
    } catch {
      return { fieldErrors: { requestedAmount: "Use an amount like 12.50." } }
    }
    if (requestedAmountMinor <= 0) {
      return { fieldErrors: { requestedAmount: "Enter an amount above zero." } }
    }
    if (requestedAmountMinor > order.original_amount_minor) {
      return {
        fieldErrors: {
          requestedAmount: "The request can't exceed the captured amount.",
        },
      }
    }
  }

  const { data: created, error: caseError } = await admin
    .from("cases")
    .insert({
      merchant_id: member.workspace.id,
      order_id: order.id,
      customer_display_name: input.customerDisplayName,
      customer_email: input.customerEmail || null,
      customer_message: input.customerMessage,
      claimed_issue: input.claimedIssue,
      request_category: input.requestCategory,
      requested_amount_minor: requestedAmountMinor,
      currency_code: order.currency_code,
      supporting_details: input.supportingDetails || null,
      origin: "app",
      created_by: member.userId,
    })
    .select("id, case_number")
    .single()
  if (caseError)
    throw new Error("Could not create the case", { cause: caseError })

  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    caseId: created.id,
    actor: { type: "user", id: member.userId },
    eventType: "case.created",
    summary: `Case ${created.case_number} opened for sandbox payment ${order.external_order_reference}.`,
    metadata: {
      order_id: order.id,
      paypal_capture_id: order.paypal_capture_id,
      requested_amount_minor: requestedAmountMinor,
    },
  })

  redirect(`/cases/${created.id}`)
}

/**
 * Re-reads a pending or unconfirmed payment from PayPal. An approved order that
 * was never captured is captured with its stored PayPal-Request-Id.
 */
export async function checkPaymentStatus(
  orderId: string,
): Promise<CheckoutOutcome> {
  const member = await requireMember()
  if (!can.runSandboxCheckout(member.role)) {
    return {
      status: "error",
      message: "Your role can't manage sandbox payments.",
    }
  }
  const parsed = z.uuid().safeParse(orderId)
  if (!parsed.success) return { status: "error", message: "Invalid order." }
  const outcome = await refreshSandboxPayment(member, parsed.data)
  refresh()
  return outcome
}
