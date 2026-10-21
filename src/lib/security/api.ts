import "server-only"

import { NextResponse } from "next/server"

import { getViewer, type Member } from "@/lib/security/auth"

export function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status })
}

/**
 * Route Handlers authenticate with the session cookie, so they must reject
 * cross-site requests (Server Actions get this check from Next.js already).
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return false
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Authenticated member for a JSON API call, or the error response to return. */
export async function requireApiMember(
  request: Request,
): Promise<{ member: Member } | { response: NextResponse }> {
  if (!isSameOrigin(request)) {
    return {
      response: jsonError(403, "forbidden", "Cross-site request rejected."),
    }
  }
  const viewer = await getViewer()
  if (viewer.status === "anonymous") {
    return {
      response: jsonError(401, "unauthenticated", "Sign in to continue."),
    }
  }
  if (viewer.status === "no-workspace") {
    return {
      response: jsonError(
        403,
        "forbidden",
        "Your account has no merchant workspace.",
      ),
    }
  }
  return { member: viewer }
}
