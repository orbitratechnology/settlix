"use client"

import { useActionState } from "react"
import { AlertCircleIcon, CheckCircle2Icon, SendIcon } from "lucide-react"

import {
  replyToStore,
  type ReplyState,
} from "@/app/(customer)/status/[token]/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

export function ReplyForm({
  token,
  storeName,
  prompt,
}: {
  token: string
  storeName: string
  prompt: string
}) {
  const [state, formAction, pending] = useActionState<ReplyState, FormData>(
    replyToStore.bind(null, token),
    { attempt: 0 },
  )

  return (
    <form
      key={state.attempt}
      action={formAction}
      className="flex flex-col gap-3"
    >
      {state.sent ? (
        <Alert aria-live="polite">
          <CheckCircle2Icon />
          <AlertTitle>Sent to {storeName}</AlertTitle>
          <AlertDescription>
            It&apos;s now part of your request.
          </AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor="reply">{prompt}</FieldLabel>
        <Textarea
          id="reply"
          name="text"
          rows={4}
          aria-invalid={state.error ? true : undefined}
          placeholder="Add details, answer the store's question, or say if you have photos."
          required
        />
        {state.error ? (
          <FieldError>
            <span className="flex items-center gap-1.5">
              <AlertCircleIcon className="size-4" aria-hidden />
              {state.error}
            </span>
          </FieldError>
        ) : null}
      </Field>
      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SendIcon data-icon="inline-start" />
        )}
        {pending ? "Sending…" : "Send to the store"}
      </Button>
    </form>
  )
}
