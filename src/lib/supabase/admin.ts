import "server-only"

import { createClient } from "@supabase/supabase-js"

import { publicEnv } from "@/lib/env/public"
import { serverEnv } from "@/lib/env/server"
import type { Database } from "@/types/database"

/**
 * Privileged client (secret key, bypasses RLS). Only for server code that has
 * already authorized the caller and scopes every write to the caller's merchant.
 */
export function createAdminClient() {
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}
