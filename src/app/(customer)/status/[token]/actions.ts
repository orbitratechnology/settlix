"use server"

import { refresh } from "next/cache"
import { headers } from "next/headers"
import { after } from "next/server"

import { replyFormSchema } from "@/lib/intake/form"
import { autoCheckRequest } from "@/lib/intake/service"
import { replyOnStatusPage } from "@/lib/intake/status-page"
import { visitorKey } from "@/lib/security/rate-limit"

export type ReplyState = { attempt: number; error?: string; sent?: boolean }

/** The customer's reply on their status page; the token is the only key. */
export async function replyToStore(
  token: string,
  previous: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const attempt = previous.attempt + 1
  const parsed = replyFormSchema.safeParse({ text: formData.get("text") })
  if (!parsed.success) {
    return { attempt, error: parsed.error.issues[0].message }
  }

  const result = await replyOnStatusPage(
    token,
    parsed.data.text,
    visitorKey(await headers()),
  )
  switch (result.status) {
    case "not_found":
      return { attempt, error: "This request link isn't valid anymore." }
    case "closed":
      return {
        attempt,
        error:
          "This request is being finished, so replies are closed here. Contact the store directly.",
      }
    case "rate_limited":
      return {
        attempt,
        error: "Too many replies in the last hour. Try again later.",
      }
  }

  const { merchantId, caseId, check } = result
  if (check && merchantId && caseId) {
    after(() =>
      autoCheckRequest(merchantId, caseId).catch(() => {
        console.error("Automatic check failed", { caseId })
      }),
    )
  }
  refresh()
  return { attempt, sent: true }
}
