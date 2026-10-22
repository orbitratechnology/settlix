import { formatDateTime } from "@/lib/format"

/** What the database allows in cases.customer_message. */
export const CUSTOMER_MESSAGE_LIMIT = 5000

export type CustomerTextSource =
  "the request form" | "email" | "the status page"

/**
 * Adds a later message from the customer to the request's text, which is what
 * Claude reads, labelled with when and how it arrived. A long addition is
 * shortened to fit; null when there is no room left at all (the full text is
 * still kept in the conversation).
 */
export function appendCustomerText(
  existing: string,
  addition: string,
  source: CustomerTextSource,
  when: Date,
): string | null {
  const label = `\n\n[The customer added this through ${source}, ${formatDateTime(when)}]\n`
  const room = CUSTOMER_MESSAGE_LIMIT - existing.length - label.length
  const text = addition.trim()
  if (!text || room < 40) return null
  const fitted =
    text.length <= room
      ? text
      : `${text.slice(0, room - 12).trimEnd()} (shortened)`
  return `${existing}${label}${fitted}`
}
