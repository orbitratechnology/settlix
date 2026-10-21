import "server-only"

import { z } from "zod"

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

/** Which optional integrations are configured, without exposing any value. */
export function integrationConfig() {
  return {
    paypal: Boolean(
      process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
    ),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
  }
}
