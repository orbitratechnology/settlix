import "server-only"

import { headers } from "next/headers"

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i

/**
 * The public origin for links Settlix hands out (request form, status pages,
 * the Google OAuth redirect). `SETTLIX_SITE_URL` pins it; otherwise it comes
 * from the request, which works for localhost and the Vercel domain alike.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.SETTLIX_SITE_URL?.trim()
  if (configured) return new URL(configured).origin

  const requestHeaders = await headers()
  const forwarded = requestHeaders.get("x-forwarded-host")?.split(",")[0]
  const host = (forwarded ?? requestHeaders.get("host") ?? "").trim()
  if (!HOST.test(host)) return "http://localhost:3000"
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host)
  const proto =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (local ? "http" : "https")
  return `${proto === "http" && !local ? "https" : proto}://${host}`
}
