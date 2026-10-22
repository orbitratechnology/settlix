/**
 * Links and wording for messages to customers. Everything here is plain text:
 * Settlix never sends HTML email.
 */

export type RequestFormLinkOptions = {
  /** Where the link was shared (qr, email, site, receipt…), for the inbox. */
  via?: string
  /** Prefills the order number. */
  order?: string
}

export function requestFormUrl(
  origin: string,
  slug: string,
  options: RequestFormLinkOptions = {},
): string {
  const url = new URL(`/r/${encodeURIComponent(slug)}`, origin)
  if (options.order) url.searchParams.set("order", options.order)
  if (options.via) url.searchParams.set("via", options.via)
  return url.toString()
}

export function statusUrl(origin: string, token: string): string {
  return new URL(`/status/${token}`, origin).toString()
}

/** "Maya Chen" → "Maya"; falls back to "there" ("Hi there"). */
export function firstName(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0]
  return first && /\p{L}/u.test(first) ? first : "there"
}

/**
 * The subject of every email about a request. It names the request and says
 * "refund", so the customer's replies stay in one thread and are found when
 * Settlix checks Gmail.
 */
export function requestSubject(caseNumber: string): string {
  return `Your refund request ${caseNumber}`
}

export function replySubject(caseNumber: string, subject?: string | null) {
  const base = subject?.trim() || requestSubject(caseNumber)
  return /^re:/i.test(base) ? base : `Re: ${base}`
}

/** Sent when a request arrives (form or email), if the store connected Gmail. */
export function acknowledgementMessage(input: {
  storeName: string
  customerName: string
  caseNumber: string
  orderReference: string
  statusUrl: string
}) {
  return {
    subject: requestSubject(input.caseNumber),
    body: [
      `Hi ${firstName(input.customerName)},`,
      "",
      `Thanks for getting in touch about order ${input.orderReference}. We have your refund request (${input.caseNumber}) and will look at it shortly.`,
      "",
      "You can follow it, or add photos and details, here:",
      input.statusUrl,
      "",
      "If you reply to this email, it goes to the same request.",
      "",
      input.storeName,
    ].join("\n"),
  }
}

/** Adds the customer's status link to a message that doesn't have it yet. */
export function withStatusLink(body: string, link: string | null): string {
  const text = body.trim()
  if (!link || text.includes(link)) return text
  return `${text}\n\nFollow your request or reply here: ${link}`
}

/** Most email apps cut mailto: links somewhere above 2,000 characters. */
const MAILTO_BODY_LIMIT = 1800

export function mailtoHref(input: {
  to: string
  subject: string
  body: string
}): string {
  const body =
    input.body.length > MAILTO_BODY_LIMIT
      ? `${input.body.slice(0, MAILTO_BODY_LIMIT)}…`
      : input.body
  const query = new URLSearchParams({ subject: input.subject, body })
    .toString()
    // mailto: wants %20, not "+", for spaces.
    .replaceAll("+", "%20")
  return `mailto:${encodeURIComponent(input.to).replace("%40", "@")}?${query}`
}

/**
 * The starting text for a message to the customer. Once a refund was sent it
 * states only what PayPal's records prove; before that it offers Claude's
 * draft, which the merchant edits before sending.
 */
export function replyDraft(input: {
  customerName: string
  orderReference: string
  refund: {
    status:
      "REQUESTED" | "PENDING" | "COMPLETED" | "FAILED" | "RECOVERY_REQUIRED"
    amount: string
    paypalRefundId: string | null
  } | null
  claudeDraft: string | null
}): string {
  const hi = `Hi ${firstName(input.customerName)},`
  const { refund } = input
  if (refund?.status === "COMPLETED" && refund.paypalRefundId) {
    return `${hi}\n\nWe've refunded ${refund.amount} for order ${input.orderReference} to the PayPal account you paid with (PayPal reference ${refund.paypalRefundId}). How soon it shows on your statement depends on your payment method.\n\nThank you for your patience.`
  }
  if (refund?.status === "PENDING" || refund?.status === "REQUESTED") {
    return `${hi}\n\nWe've sent a refund of ${refund.amount} for order ${input.orderReference} to PayPal. PayPal is still processing it; we'll confirm as soon as it's complete.\n\nThank you for your patience.`
  }
  return input.claudeDraft?.trim() ?? ""
}

/** "Ask the customer for more", worded for the customer, from Claude's list. */
export function evidenceRequestDraft(
  customerName: string,
  missing: string[],
): string {
  const items = missing.map((item) => item.trim()).filter(Boolean)
  const ask = items.length
    ? `To continue, could you send us:\n${items.map((item) => `- ${item}`).join("\n")}`
    : "To continue, could you tell us a little more about what happened? Photos help if you have them."
  return `Hi ${firstName(customerName)},\n\nThanks for your request. ${ask}\n\nYou can reply on your request page or to this email.`
}
