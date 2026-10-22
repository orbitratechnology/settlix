import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * AES-256-GCM for OAuth tokens at rest. The context (e.g. "gmail-refresh:<merchant
 * ID>") is authenticated data, so a ciphertext copied to another merchant's row
 * fails to decrypt. Format: "v1.<iv>.<tag>.<ciphertext>", base64url parts.
 */

const VERSION = "v1"

/** Reads a 32-byte key from base64 or base64url; null when it isn't one. */
export function parseEncryptionKey(value: string | undefined): Buffer | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) return null
  const key = Buffer.from(
    trimmed.replaceAll("-", "+").replaceAll("_", "/"),
    "base64",
  )
  return key.length === 32 ? key : null
}

export function encryptSecret(
  plaintext: string,
  context: string,
  key: Buffer,
): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(context, "utf8"))
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".")
}

export function decryptSecret(
  ciphertext: string,
  context: string,
  key: Buffer,
): string {
  const [version, iv, tag, data] = ciphertext.split(".")
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error("Unsupported ciphertext format")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  )
  decipher.setAAD(Buffer.from(context, "utf8"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
