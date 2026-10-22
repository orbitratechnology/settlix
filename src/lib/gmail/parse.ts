/**
 * Reads Gmail API messages (`users.messages.get`, format=full) into the plain
 * facts Settlix keeps. Email content is untrusted customer data: it is stored
 * and shown as text, and Claude reads it as information, never as instructions.
 */

export type GmailHeader = { name: string; value: string }

export type GmailMessagePart = {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailMessagePart[]
}

export type GmailMessage = {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: GmailMessagePart
}

export function headerValues(message: GmailMessage, name: string): string[] {
  const wanted = name.toLowerCase()
  return (message.payload?.headers ?? [])
    .filter((header) => header.name.toLowerCase() === wanted)
    .map((header) => header.value)
}

export function headerValue(message: GmailMessage, name: string) {
  return headerValues(message, name)[0] ?? null
}

/** Decodes RFC 2047 encoded-words ("=?UTF-8?B?...?=", "=?utf-8?Q?...?="). */
export function decodeHeaderText(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(
      /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
      (whole, charset: string, encoding: string, text: string) => {
        try {
          const bytes =
            encoding.toUpperCase() === "B"
              ? Buffer.from(text, "base64")
              : Buffer.from(
                  text
                    .replaceAll("_", " ")
                    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
                      String.fromCharCode(parseInt(hex, 16)),
                    ),
                  "latin1",
                )
          return new TextDecoder(charset.toLowerCase()).decode(bytes)
        } catch {
          return whole
        }
      },
    )
}

const ADDRESS = /<?([^<>\s@",;]+@[^<>\s@",;]+\.[^<>\s@",;]+)>?/

/** `"Maya Chen" <maya@example.com>` → { email, name }. */
export function parseAddress(
  value: string | null,
): { email: string; name: string | null } | null {
  if (!value) return null
  const decoded = decodeHeaderText(value)
  const match = decoded.match(ADDRESS)
  if (!match) return null
  const email = match[1].toLowerCase()
  const name = decoded
    .slice(0, match.index)
    .replace(/^[\s"']+|[\s"']+$/g, "")
    .trim()
  return { email, name: name ? name.slice(0, 120) : null }
}

function decodeBody(data: string | undefined, mimeType: string | undefined) {
  if (!data) return ""
  const charset = mimeType?.match(/charset="?([\w-]+)"?/i)?.[1] ?? "utf-8"
  const bytes = Buffer.from(data, "base64url")
  try {
    return new TextDecoder(charset.toLowerCase()).decode(bytes)
  } catch {
    return bytes.toString("utf8")
  }
}

function partCharset(part: GmailMessagePart) {
  return part.headers?.find((h) => h.name.toLowerCase() === "content-type")
    ?.value
}

function walk(part: GmailMessagePart | undefined, visit: (p: GmailMessagePart) => void) {
  if (!part) return
  visit(part)
  for (const child of part.parts ?? []) walk(child, visit)
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

/** Good-enough HTML → text for customer emails (no markup is ever rendered). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (whole, entity: string) => {
      if (entity.startsWith("#x")) {
        return String.fromCodePoint(parseInt(entity.slice(2), 16))
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(parseInt(entity.slice(1), 10))
      }
      return ENTITIES[entity.toLowerCase()] ?? whole
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** The readable text of a message: text/plain if present, else its HTML as text. */
export function messageText(message: GmailMessage): string {
  let plain = ""
  let html = ""
  walk(message.payload, (part) => {
    if (part.filename) return
    const type = part.mimeType?.toLowerCase()
    if (type === "text/plain" && !plain) {
      plain = decodeBody(part.body?.data, partCharset(part))
    } else if (type === "text/html" && !html) {
      html = decodeBody(part.body?.data, partCharset(part))
    }
  })
  return (plain || htmlToText(html) || message.snippet || "").replace(
    /\r\n/g,
    "\n",
  )
}

/** File names attached to the message (Settlix never downloads them). */
export function attachmentNames(message: GmailMessage): string[] {
  const names: string[] = []
  walk(message.payload, (part) => {
    if (part.filename && part.body?.attachmentId) {
      names.push(part.filename.slice(0, 120))
    }
  })
  return names
}

const QUOTE_HEADERS = [
  /^On .{4,200}wrote:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^-{2,}\s*Forwarded message\s*-{2,}/im,
  /^From: .+\n(Sent|Date): /m,
  /^_{10,}\s*$/m,
]

/** Drops the quoted earlier conversation and a "-- " signature from a reply. */
export function stripQuotedReply(text: string): string {
  let cut = text.length
  for (const pattern of QUOTE_HEADERS) {
    const match = pattern.exec(text)
    if (match && match.index > 0 && match.index < cut) cut = match.index
  }
  const signature = text.search(/^-- ?$/m)
  if (signature > 0 && signature < cut) cut = signature
  return text
    .slice(0, cut)
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function domainOf(address: string | undefined | null) {
  return address?.split("@").pop()?.toLowerCase().replace(/>$/, "") ?? null
}

function sameOrgDomain(domain: string | null, fromDomain: string) {
  return Boolean(
    domain && (domain === fromDomain || fromDomain.endsWith(`.${domain}`)),
  )
}

/**
 * Whether Gmail authenticated the sender's domain. Only the topmost
 * Authentication-Results header counts: Gmail adds it on arrival, and a sender
 * can forge headers below it. Passes on DMARC for the From domain, or DKIM /
 * SPF aligned with it.
 */
export function senderAuthenticated(
  message: GmailMessage,
  fromEmail: string,
): boolean {
  const fromDomain = domainOf(fromEmail)
  const results = headerValues(message, "Authentication-Results")[0]
  if (!fromDomain || !results || !/^\s*mx\.google\.com\s*;/i.test(results)) {
    return false
  }
  const dmarc = results.match(/\bdmarc=pass\b[^;]*?header\.from=([^\s;]+)/i)
  if (dmarc && sameOrgDomain(dmarc[1].toLowerCase(), fromDomain)) return true
  for (const dkim of results.matchAll(
    /\bdkim=pass\b[^;]*?header\.(?:i=@?|d=)([^\s;]+)/gi,
  )) {
    if (sameOrgDomain(domainOf(dkim[1]) ?? dkim[1].toLowerCase(), fromDomain)) {
      return true
    }
  }
  const spf = results.match(/\bspf=pass\b[^;]*?smtp\.mailfrom=([^\s;]+)/i)
  return Boolean(spf && sameOrgDomain(domainOf(spf[1]), fromDomain))
}

export type ParsedEmail = {
  gmailMessageId: string
  threadId: string
  rfcMessageId: string | null
  references: string[]
  fromEmail: string
  fromName: string | null
  subject: string | null
  receivedAt: string
  /** The new text of the message (quotes removed), with attachments noted. */
  text: string
  attachments: string[]
  authenticated: boolean
  /** Auto-replies and bulk mail are never turned into requests. */
  automated: boolean
}

const MESSAGE_ID = /<[^<>\s]{1,500}>/g

export function parseGmailMessage(message: GmailMessage): ParsedEmail | null {
  const from = parseAddress(headerValue(message, "From"))
  if (!from) return null
  const subject = headerValue(message, "Subject")
  const attachments = attachmentNames(message)
  const body = stripQuotedReply(messageText(message))
  const note = attachments.length
    ? `\n\n[The customer attached ${attachments.length === 1 ? "a file" : `${attachments.length} files`} (${attachments.join(", ")}). Open the email in Gmail to see ${attachments.length === 1 ? "it" : "them"}; Settlix doesn't download attachments.]`
    : ""
  const autoSubmitted = headerValue(message, "Auto-Submitted")
  const precedence = headerValue(message, "Precedence")
  const internal = Number(message.internalDate)

  return {
    gmailMessageId: message.id,
    threadId: message.threadId,
    rfcMessageId: headerValue(message, "Message-ID")?.match(MESSAGE_ID)?.[0] ?? null,
    references: [
      ...(headerValue(message, "References")?.match(MESSAGE_ID) ?? []),
    ].slice(-10),
    fromEmail: from.email,
    fromName: from.name,
    subject: subject ? decodeHeaderText(subject).slice(0, 300) : null,
    receivedAt: Number.isFinite(internal)
      ? new Date(internal).toISOString()
      : new Date().toISOString(),
    text: `${body}${note}`.trim().slice(0, 5000),
    attachments,
    authenticated: senderAuthenticated(message, from.email),
    automated:
      Boolean(autoSubmitted && !/^no$/i.test(autoSubmitted.trim())) ||
      /^(bulk|junk|list|auto_reply)$/i.test(precedence?.trim() ?? "") ||
      headerValue(message, "List-Unsubscribe") !== null,
  }
}
