/**
 * Builds the RFC 5322 message Gmail's `users.messages.send` expects (`raw`,
 * base64url). Plain text only. Gmail fills in From with the connected account.
 */

const EMAIL = /^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]+$/
const LINE_BREAK = /[\r\n]/
const MESSAGE_ID = /^<[^<>\s]{1,500}>$/

export class MimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MimeError"
  }
}

/** RFC 2047 encoded-word for non-ASCII header text. */
export function encodeHeaderText(value: string): string {
  // Printable ASCII only goes through as is.
  if (/^[\x20-\x7e]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? ""
}

export type OutgoingEmail = {
  to: string
  subject: string
  body: string
  /** The Message-ID this replies to, e.g. "<abc@mail.gmail.com>". */
  inReplyTo?: string | null
  /** Earlier Message-IDs of the conversation. */
  references?: string[]
}

export function buildRawEmail(email: OutgoingEmail): string {
  const to = email.to.trim()
  if (!EMAIL.test(to) || LINE_BREAK.test(to)) {
    throw new MimeError("Invalid recipient address.")
  }
  const subject = email.subject.replace(/\s+/g, " ").trim().slice(0, 250)
  if (!subject) throw new MimeError("A subject is required.")
  if (!email.body.trim()) throw new MimeError("The message is empty.")

  const references = [
    ...(email.references ?? []),
    ...(email.inReplyTo ? [email.inReplyTo] : []),
  ].filter((id, index, all) => all.indexOf(id) === index)
  for (const id of references) {
    if (!MESSAGE_ID.test(id)) throw new MimeError("Invalid Message-ID.")
  }

  const headers = [
    `To: ${to}`,
    `Subject: ${encodeHeaderText(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    ...(email.inReplyTo ? [`In-Reply-To: ${email.inReplyTo}`] : []),
    ...(references.length ? [`References: ${references.join(" ")}`] : []),
  ]
  const body = email.body.replace(/\r?\n/g, "\r\n")
  const message = `${headers.join("\r\n")}\r\n\r\n${wrapBase64(
    Buffer.from(body, "utf8").toString("base64"),
  )}\r\n`
  return Buffer.from(message, "utf8").toString("base64url")
}
