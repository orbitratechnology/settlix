/**
 * Order references a customer can type: the store's order number (HP-10421,
 * SBX-FB92B37F) or the PayPal transaction ID from PayPal's receipt email (the
 * capture ID). Matching is case-insensitive and ignores a leading "#" and spaces.
 */

const REFERENCE = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/

/** Normalized reference, or null when it can't be an order number. */
export function normalizeOrderReference(input: string): string | null {
  const value = input
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .toUpperCase()
  return REFERENCE.test(value) ? value : null
}

/** Normalized email for comparisons (emails are matched case-insensitively). */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

/** Escapes a value for an exact, case-insensitive PostgREST `ilike` match. */
export function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

const CANDIDATE = /(?:^|[^A-Za-z0-9])#?([A-Za-z0-9][A-Za-z0-9-]{3,63})/g

/**
 * Tokens in free text that could be order numbers or PayPal transaction IDs,
 * e.g. "Order #HP-10421" → HP-10421. A token needs a digit, so plain words
 * never match. At most `limit` distinct candidates, in order of appearance.
 */
export function findReferenceCandidates(text: string, limit = 20): string[] {
  const found: string[] = []
  for (const match of text.matchAll(CANDIDATE)) {
    const token = match[1].replace(/-+$/, "").toUpperCase()
    if (token.length < 4 || !/\d/.test(token)) continue
    // Prices, dates and phone numbers are digits only; references mix in letters
    // (PayPal IDs and order numbers both do) unless they are long.
    if (/^\d+$/.test(token) && token.length < 6) continue
    if (!REFERENCE.test(token) || found.includes(token)) continue
    found.push(token)
    if (found.length >= limit) break
  }
  return found
}

/** "sam.rivera@example.com" → "Sam Rivera", for requests without a name. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? ""
  const words = local
    .split(/[._+-]+/)
    .map((word) => word.replace(/\d+/g, ""))
    .filter(Boolean)
  const name = words
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
  return (name || "Customer").slice(0, 120)
}
