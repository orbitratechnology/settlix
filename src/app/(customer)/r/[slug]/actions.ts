"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { after } from "next/server"

import {
  cleanVia,
  requestFormSchema,
  type RequestFormState,
  type RequestFormValues,
} from "@/lib/intake/form"
import { acknowledgeRequest } from "@/lib/intake/outbound"
import {
  autoCheckRequest,
  findPublicStore,
  submitPublicRequest,
} from "@/lib/intake/service"
import { visitorKey } from "@/lib/security/rate-limit"
import { siteOrigin } from "@/lib/site"
import { createAdminClient } from "@/lib/supabase/admin"

function echo(formData: FormData): RequestFormValues {
  const text = (name: string) => String(formData.get(name) ?? "").slice(0, 3000)
  return {
    order: text("order"),
    email: text("email"),
    name: text("name"),
    reason: text("reason"),
    details: text("details"),
    amount: text("amount"),
  }
}

/**
 * The public refund request. Anyone can send it, so it trusts nothing from the
 * form: the store comes from the link, the order must be one of the store's
 * paid orders, and the email must be the buyer's. Success opens the customer's
 * status page; Settlix then confirms by email (if the store connected Gmail)
 * and has Claude check the request, after the response.
 */
export async function submitRefundRequest(
  slug: string,
  previous: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const attempt = previous.attempt + 1
  const values = echo(formData)
  const store = await findPublicStore(slug)
  if (!store?.formEnabled) {
    return {
      attempt,
      values,
      error:
        "This store isn't taking refund requests here right now. Contact the store directly.",
    }
  }

  const parsed = requestFormSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: RequestFormState["fieldErrors"] = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]) as keyof RequestFormValues
      if (key in values) fieldErrors[key] ??= issue.message
    }
    // A filled honeypot gets the same vague answer as any other problem.
    return {
      attempt,
      values,
      fieldErrors,
      error: "Check the highlighted fields.",
    }
  }
  const input = parsed.data

  const result = await submitPublicRequest(
    store,
    {
      reference: input.order,
      email: input.email,
      name: input.name || null,
      category: input.reason,
      details: input.details,
      amount: input.amount || null,
      via: cleanVia(input.via),
    },
    visitorKey(await headers()),
  )

  switch (result.status) {
    case "rate_limited":
      return {
        attempt,
        values,
        error:
          "Too many requests from here in the last hour. Try again later, or contact the store directly.",
      }
    case "no_match":
      return {
        attempt,
        values,
        fieldErrors: {
          order: "We couldn't find a paid order with this number and email.",
          email: "Use the email address you paid with.",
        },
        error:
          "The order number and email don't match the store's records. Check both against your receipt or PayPal's email.",
      }
    case "invalid_amount":
      return {
        attempt,
        values,
        fieldErrors: { amount: result.message },
        error: "Check the highlighted fields.",
      }
  }

  const origin = await siteOrigin()
  after(async () => {
    const admin = createAdminClient()
    if (result.status === "created") {
      await acknowledgeRequest({
        admin,
        merchantId: store.id,
        storeName: store.name,
        caseId: result.caseId,
        origin,
      }).catch(() => {
        console.error("Could not acknowledge the request", {
          caseId: result.caseId,
        })
      })
    }
    if (store.autoCheck && result.check) {
      await autoCheckRequest(store.id, result.caseId).catch(() => {
        console.error("Automatic check failed", { caseId: result.caseId })
      })
    }
  })

  redirect(
    `/status/${result.statusToken}?${result.status === "created" ? "sent" : "added"}=1`,
  )
}
