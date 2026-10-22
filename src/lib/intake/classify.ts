import type { RequestCategory } from "@/lib/domain/labels"

/**
 * A free, deterministic first guess at why a customer wrote, for requests that
 * arrive by email (the form asks the customer directly). Claude still reads the
 * whole message; the category only sorts the inbox.
 */
const rules: { category: RequestCategory; pattern: RegExp }[] = [
  {
    category: "not_received",
    pattern:
      /\b(never (arrived|came|got it|received)|(has ?n[o']t|did ?n[o']t|hasn't|didn't|not|still not) (arrived|been delivered|received|shown up|come)|not received|never received|haven'?t (received|got)|lost in (the )?(mail|post|transit)|where is my (order|package|parcel)|(package|parcel|order|delivery) (is|was) (missing|lost)|no (package|parcel) (arrived|came))\b/i,
  },
  {
    category: "wrong_item",
    pattern:
      /\b(wrong (item|size|colou?r|product|model|one|thing|version)|sent (me )?the wrong|not what i (ordered|bought)|received (a |the )?different (item|product))\b/i,
  },
  {
    category: "missing_parts",
    pattern:
      /\b(missing (a |the |some )?(part|piece|component|item|lid|cable|accessor|screw)s?|(are|is|were|was) missing|incomplete (set|order|kit))\b/i,
  },
  {
    category: "damaged_item",
    pattern:
      /\b(damaged|broken|broke|cracked|crack|shattered|smashed|dented|torn|ripped|defective|faulty|leak(s|ing|ed)?|(does ?n[o']t|doesn't|won't|will not|stopped) work(ing)?)\b/i,
  },
  {
    category: "not_as_described",
    pattern:
      /\b(not as (described|pictured|advertised|shown)|does ?n[o']t match (the )?(description|photos?|pictures?|listing)|looks nothing like|scratch(es|ed)?|poor quality|cheaply made)\b/i,
  },
  {
    category: "changed_mind",
    pattern:
      /\b(changed my mind|no longer (need|want)|do ?n[o']t (need|want) (it|this|them)|ordered (it )?by mistake|ordered the wrong|by accident)\b/i,
  },
]

export function classifyRequest(text: string): RequestCategory {
  return rules.find((rule) => rule.pattern.test(text))?.category ?? "other"
}

const REPLY_PREFIX = /^\s*((re|fwd?|aw|wg|sv|vs)\s*(\[\d+\])?\s*:\s*)+/i

/** Subject without "Re:" / "Fwd:" prefixes and extra spaces. */
export function cleanSubject(subject: string | null | undefined): string {
  return (subject ?? "").replace(REPLY_PREFIX, "").replace(/\s+/g, " ").trim()
}

/**
 * A short "Problem" line for the inbox: the email's subject when it says
 * something, otherwise the first sentence of the message.
 */
export function summarizeIssue(
  subject: string | null | undefined,
  body: string,
): string {
  const cleaned = cleanSubject(subject)
  if (cleaned.length >= 6 && !/^(refund|return|help|hi|hello|order)$/i.test(cleaned)) {
    return cleaned.slice(0, 300)
  }
  const sentence =
    body
      .replace(/\s+/g, " ")
      .trim()
      .match(/^.{1,160}?[.!?](\s|$)/)?.[0] ?? body.replace(/\s+/g, " ").trim()
  const line = sentence.trim().slice(0, 160)
  return (line || cleaned || "Refund request").slice(0, 300)
}
