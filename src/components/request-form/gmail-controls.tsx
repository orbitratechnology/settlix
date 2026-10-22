"use client"

import { useActionState, useState, useTransition } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertCircleIcon,
  CircleCheckBigIcon,
  MailIcon,
  RefreshCwIcon,
  UnplugIcon,
} from "lucide-react"

import {
  checkGmailNow,
  disconnectGmail,
  startGmailConnect,
  type CheckGmailResult,
  type GmailActionState,
} from "@/app/(app)/request-form/gmail-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"

/**
 * Connect (or reconnect) Gmail: two plain choices, then one Google consent
 * screen. Google lets the merchant untick either permission there too; Settlix
 * uses only what was granted.
 */
export function ConnectGmailForm({
  reconnect,
  defaults = { send: true, read: true },
}: {
  reconnect: boolean
  defaults?: { send: boolean; read: boolean }
}) {
  const [state, formAction, pending] = useActionState<
    GmailActionState,
    FormData
  >(startGmailConnect, {})

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FieldGroup className="gap-4">
        <Field orientation="horizontal">
          <Checkbox id="gmail-send" name="send" defaultChecked={defaults.send} />
          <FieldContent>
            <FieldLabel htmlFor="gmail-send">
              Send replies from my Gmail
            </FieldLabel>
            <FieldDescription>
              Your messages to customers go out from your address, in the same
              email thread. Settlix only sends what you send.
            </FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="gmail-read" name="read" defaultChecked={defaults.read} />
          <FieldContent>
            <FieldLabel htmlFor="gmail-read">
              Bring refund emails into Settlix
            </FieldLabel>
            <FieldDescription>
              Settlix asks Gmail only for emails that look like refund requests
              (refund, return, damaged, never arrived…) and replies to your
              requests. It never changes or deletes anything.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <MailIcon data-icon="inline-start" />
        )}
        {reconnect ? "Reconnect Gmail" : "Connect Gmail"}
      </Button>
    </form>
  )
}

const checkMessages: Record<
  Exclude<CheckGmailResult["status"], "done" | "error">,
  string
> = {
  busy: "Settlix is already checking Gmail. Try again in a minute.",
  not_reading:
    "This connection can only send. Reconnect and tick “Bring refund emails into Settlix”.",
  rate_limited: "Gmail was checked many times this hour. Try again later.",
}

function describe(result: CheckGmailResult): string {
  if (result.status === "error") return result.message
  if (result.status !== "done") return checkMessages[result.status]
  const parts = [
    result.created
      ? `${result.created} new request${result.created === 1 ? "" : "s"}`
      : null,
    result.followUps
      ? `${result.followUps} repl${result.followUps === 1 ? "y" : "ies"} added`
      : null,
    result.toSort ? `${result.toSort} to sort` : null,
  ].filter(Boolean)
  return parts.length ? `Done: ${parts.join(", ")}.` : "No new refund emails."
}

export function CheckGmailButton() {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null)
            setMessage(describe(await checkGmailNow()))
          })
        }
      >
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <RefreshCwIcon data-icon="inline-start" />
        )}
        {pending ? "Checking Gmail…" : "Check Gmail now"}
      </Button>
      {message ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  )
}

export function DisconnectGmailButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await disconnectGmail()
            setError(result.error ?? null)
          })
        }
      >
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <UnplugIcon data-icon="inline-start" />
        )}
        Disconnect
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

const results: Record<
  string,
  { ok: boolean; title: string; text?: string }
> = {
  connected: { ok: true, title: "Gmail connected" },
  connected_send: {
    ok: true,
    title: "Gmail connected for sending",
    text: "You didn't allow reading, so refund emails stay in Gmail.",
  },
  connected_read: {
    ok: true,
    title: "Gmail connected for reading",
    text: "You didn't allow sending, so replies open in your email app instead.",
  },
  denied: {
    ok: false,
    title: "Gmail wasn't connected",
    text: "Google's screen was cancelled. Nothing changed.",
  },
  no_permission: {
    ok: false,
    title: "Gmail wasn't connected",
    text: "Every Gmail permission was unticked on Google's screen, so there was nothing to connect.",
  },
  expired: {
    ok: false,
    title: "That took too long",
    text: "The connection link expired or was opened in another browser. Start again.",
  },
  forbidden: {
    ok: false,
    title: "Gmail wasn't connected",
    text: "Sign in as an owner or admin of this store, then start again.",
  },
  not_configured: {
    ok: false,
    title: "Gmail isn't set up on this server",
  },
  failed: {
    ok: false,
    title: "Gmail wasn't connected",
    text: "Google didn't complete the connection. Try again.",
  },
}

/** The outcome of Google's consent screen, from the callback's redirect. */
export function GmailResultNotice() {
  const params = useSearchParams()
  const result = results[params.get("gmail") ?? ""]
  if (!result) return null
  return (
    <Alert variant={result.ok ? "default" : "destructive"}>
      {result.ok ? <CircleCheckBigIcon /> : <AlertCircleIcon />}
      <AlertTitle>{result.title}</AlertTitle>
      {result.text ? <AlertDescription>{result.text}</AlertDescription> : null}
    </Alert>
  )
}

export function EmailsToSortLink({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <Link
      href="/cases/emails"
      className="text-[0.9375rem] font-medium text-primary underline-offset-4 hover:underline"
    >
      {count} email{count === 1 ? "" : "s"} to sort
    </Link>
  )
}
