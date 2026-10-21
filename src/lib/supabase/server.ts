import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { publicEnv } from "@/lib/env/public"
import type { Database } from "@/types/database"

/**
 * User-scoped Supabase client for Server Components, Server Actions, and Route
 * Handlers. Queries run as the signed-in user, so RLS limits them to the user's
 * merchant. Reading cookies makes the caller request-time (dynamic).
 */
export async function createClient() {
  const cookieStore = await cookies()
  const env = publicEnv()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The proxy refreshes sessions on every request, so this is safe.
          }
        },
      },
    },
  )
}
