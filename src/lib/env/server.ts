import "server-only"

import { z } from "zod"

import { parseEncryptionKey } from "@/lib/gmail/crypto"

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined

/** Privileged server-only configuration. Never import from client code. */
export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  })
  return cached
}

/**
 * Claude credentials and model ID (PRD §10.1: the model is server config, never
 * hardcoded). Null when either is missing, so AI features can report it.
 */
export function anthropicConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  const model = process.env.ANTHROPIC_MODEL?.trim()
  return apiKey && model ? { apiKey, model } : null
}

/**
 * The Google OAuth client and the key that encrypts Gmail tokens at rest. Null
 * when any part is missing (or the key isn't 32 bytes), so Gmail stays off.
 */
export function gmailConfig(): {
  clientId: string
  clientSecret: string
  encryptionKey: Buffer
} | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  const encryptionKey = parseEncryptionKey(process.env.SETTLIX_ENCRYPTION_KEY)
  return clientId && clientSecret && encryptionKey
    ? { clientId, clientSecret, encryptionKey }
    : null
}

/** Which optional integrations are configured, without exposing any value. */
export function integrationConfig() {
  return {
    paypal: Boolean(
      process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
    ),
    anthropic: anthropicConfig() !== null,
    gmail: gmailConfig() !== null,
  }
}
