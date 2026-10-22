"use client"

import { useActionState, useId, useState } from "react"
import {
  AlertCircleIcon,
  CircleCheckBigIcon,
  MailIcon,
  SendIcon,
  SquareArrowOutUpRightIcon,
} from "lucide-react"

import {
  sendCustomerMessage,
  type MessageState,
} from "@/app/(app)/cases/[caseId]/actions"
import { CopyButton } from "@/components/copy-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { mailtoHref, withStatusLink } from "@/lib/intake/messages"

export type Delivery =
  | { kind: "gmail"; from: string }
  | { kind: "email_app"; to: string; subject: string }
  | { kind: "page" }

/**
 * Writes to the customer. One clear button for the best way this store has:
 * from its Gmail, or posted to the customer's page and opened in the
 * merchant's own email app, or posted to the page only. Every message also
 * appears on the customer's request page.
 */
export function MessageComposer({
  caseId,
  draft,
  draftSource,
  delivery,
  statusUrl,
}: {
  caseId: string
  draft: string
  draftSource: string | null
  delivery: Delivery
  /** The customer's request page, added to emails written in the email app. */
  statusUrl: string | null
}) {
  const id = useId()
  const [text, setText] = useState(draft)
  const [state, formAction, pending] = useActionState<MessageState, FormData>(
    async (previous, formData) => {
      const result = await sendCustomerMessage(caseId, previous, formData)
      if (result.sent) setText("")
      return result
    },
    {},
  )

  const label =
    delivery.kind === "gmail"
      ? "Send"
      : delivery.kind === "email_app"
        ? "Post and open in email app"
        : "Post to the customer's page"

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        type="hidden"
        name="delivery"
        value={delivery.kind === "gmail" ? "gmail" : "page"}
      />
      {state.sent ? (
        <Alert aria-live="polite">
          <CircleCheckBigIcon />
          <AlertTitle>
            {state.sent.emailed
              ? "Sent"
              : delivery.kind === "email_app"
                ? "Posted. Send it from your email app"
                : "Posted on the customer's page"}
          </AlertTitle>
          {state.sent.emailError ? (
            <AlertDescription>
              Not emailed: {state.sent.emailError}
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor={id}>Message to the customer</FieldLabel>
        <Textarea
          id={id}
          name="text"
          rows={7}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write to the customer…"
          className="bg-background"
          required
        />
        <FieldDescription>
          {draftSource ? `${draftSource} ` : ""}
          {delivery.kind === "gmail"
            ? `Emailed from ${delivery.from}, with a link to their request page.`
            : delivery.kind === "email_app"
              ? "It goes on their request page, and your email app opens with it ready to send."
              : "It goes on their request page. This request has no email address."}
        </FieldDescription>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={pending || !text.trim()}
          onClick={() => {
            // Opened inside the click so the browser allows it; the form
            // still posts the message to the customer's page.
            if (delivery.kind === "email_app" && text.trim()) {
              window.location.href = mailtoHref({
                to: delivery.to,
                subject: delivery.subject,
                body: withStatusLink(text, statusUrl),
              })
            }
          }}
        >
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : delivery.kind === "gmail" ? (
            <SendIcon data-icon="inline-start" />
          ) : delivery.kind === "email_app" ? (
            <SquareArrowOutUpRightIcon data-icon="inline-start" />
          ) : (
            <MailIcon data-icon="inline-start" />
          )}
          {label}
        </Button>
        {text !== draft && draft ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setText(draft)}
          >
            Use the draft again
          </Button>
        ) : null}
        {text.trim() ? <CopyButton value={text} label="Copy" /> : null}
      </div>
    </form>
  )
}
