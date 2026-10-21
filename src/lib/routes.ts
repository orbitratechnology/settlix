/** Route prefixes that require a signed-in merchant member. */
export const protectedPrefixes = [
  "/dashboard",
  "/cases",
  "/policies",
  "/payments",
  "/settings",
  "/receipts",
] as const

export function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/**
 * Accepts only same-origin relative paths for post-login redirects, so a
 * crafted `next` parameter cannot send users to another site.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/dashboard",
) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback
  }
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return fallback
  }
  return value
}
