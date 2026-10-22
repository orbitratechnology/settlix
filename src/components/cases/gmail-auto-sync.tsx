"use client"

import { useEffect, useRef } from "react"

import { checkGmailNow } from "@/app/(app)/request-form/gmail-actions"

const STALE_MS = 3 * 60 * 1000

/**
 * Checks Gmail in the background when the inbox opens and the last check is a
 * few minutes old, so emailed requests show up without a button. New rows
 * appear through the action's refresh.
 */
export function GmailAutoSync({
  lastSyncedAt,
}: {
  lastSyncedAt: string | null
}) {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (lastSyncedAt && Date.now() - Date.parse(lastSyncedAt) < STALE_MS) return
    checkGmailNow().catch(() => undefined)
  }, [lastSyncedAt])
  return null
}
