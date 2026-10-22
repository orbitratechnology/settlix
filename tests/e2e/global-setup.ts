import { adminDb, e2eConfigured, ensureE2eWorkspace } from "./workspace"

/** Ensures the E2E workspace exists before any spec signs in. */
export default async function globalSetup() {
  if (!e2eConfigured()) {
    throw new Error(
      "E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the environment.",
    )
  }
  await ensureE2eWorkspace(adminDb())
}
