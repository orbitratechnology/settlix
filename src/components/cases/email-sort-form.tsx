"use client"

import { useActionState, useTransition } from "react"
import { AlertCircleIcon, FilePlus2Icon, XIcon } from "lucide-react"

import {
  dismissEmail,
  openRequestFromEmail,
  type SortState,
} from "@/app/(app)/cases/emails/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

export type OrderChoice = { value: string; label: string }

/** Pick the order an email is about and open a request, or set it aside. */
export function EmailSortForm({
  emailId,
  orders,
  suggestedOrderId,
}: {
  emailId: string
  orders: OrderChoice[]
  suggestedOrderId: string | null
}) {
  const [state, formAction, pending] = useActionState<SortState, FormData>(
    openRequestFromEmail.bind(null, emailId),
    {},
  )
  const [dismissing, startDismiss] = useTransition()
  const items = [{ value: null, label: "Choose the order" }, ...orders]
  const fieldId = `order-${emailId}`

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor={fieldId}>Which order is it about?</FieldLabel>
        <Select
          items={items}
          name="orderId"
          defaultValue={suggestedOrderId ?? null}
        >
          <SelectTrigger id={fieldId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value ?? "none"} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {state.error ? (
          <FieldError>
            <span className="flex items-center gap-1.5">
              <AlertCircleIcon className="size-4" aria-hidden />
              {state.error}
            </span>
          </FieldError>
        ) : null}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || dismissing}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <FilePlus2Icon data-icon="inline-start" />
          )}
          Open a request
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending || dismissing}
          onClick={() =>
            startDismiss(async () => void (await dismissEmail(emailId)))
          }
        >
          {dismissing ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <XIcon data-icon="inline-start" />
          )}
          Not a refund request
        </Button>
      </div>
    </form>
  )
}
