"use client"

import { useActionState } from "react"
import { AlertCircleIcon, FilePlus2Icon } from "lucide-react"

import {
  createCaseFromPayment,
  type CreateCaseState,
} from "@/app/(app)/payments/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { requestCategoryLabels } from "@/lib/domain/labels"

const categoryItems = [
  { label: "Choose a category", value: null },
  ...Object.entries(requestCategoryLabels).map(([value, label]) => ({
    label,
    value,
  })),
]

export function CreateCaseDialog({
  orderId,
  orderReference,
  amountLabel,
}: {
  orderId: string
  orderReference: string
  amountLabel: string
}) {
  const [state, formAction, pending] = useActionState<
    CreateCaseState,
    FormData
  >(createCaseFromPayment, {})
  const errors = state.fieldErrors ?? {}
  const invalid = (name: string) => (errors[name] ? true : undefined)

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <FilePlus2Icon data-icon="inline-start" />
        Create case
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form action={formAction} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Open a refund case</DialogTitle>
            <DialogDescription>
              For sandbox payment {orderReference} ({amountLabel}). The case is
              linked to this payment&apos;s PayPal capture.
            </DialogDescription>
          </DialogHeader>

          <input type="hidden" name="orderId" value={orderId} />

          {state.error ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Case not created</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={invalid("customerDisplayName")}>
              <FieldLabel htmlFor="customerDisplayName">
                Customer name
              </FieldLabel>
              <Input
                id="customerDisplayName"
                name="customerDisplayName"
                autoComplete="off"
                aria-invalid={invalid("customerDisplayName")}
                required
              />
              <FieldError>{errors.customerDisplayName}</FieldError>
            </Field>
            <Field data-invalid={invalid("customerEmail")}>
              <FieldLabel htmlFor="customerEmail">
                Customer email (optional)
              </FieldLabel>
              <Input
                id="customerEmail"
                name="customerEmail"
                type="email"
                autoComplete="off"
                aria-invalid={invalid("customerEmail")}
              />
              <FieldError>{errors.customerEmail}</FieldError>
            </Field>
            <Field data-invalid={invalid("requestCategory")}>
              <FieldLabel htmlFor="requestCategory">Category</FieldLabel>
              <Select items={categoryItems} name="requestCategory">
                <SelectTrigger
                  id="requestCategory"
                  aria-invalid={invalid("requestCategory")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {categoryItems.map((item) => (
                      <SelectItem key={item.label} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError>{errors.requestCategory}</FieldError>
            </Field>
            <Field data-invalid={invalid("claimedIssue")}>
              <FieldLabel htmlFor="claimedIssue">Claimed issue</FieldLabel>
              <Input
                id="claimedIssue"
                name="claimedIssue"
                placeholder="Carafe arrived cracked"
                aria-invalid={invalid("claimedIssue")}
                required
              />
              <FieldError>{errors.claimedIssue}</FieldError>
            </Field>
            <Field data-invalid={invalid("customerMessage")}>
              <FieldLabel htmlFor="customerMessage">
                Customer message
              </FieldLabel>
              <Textarea
                id="customerMessage"
                name="customerMessage"
                rows={4}
                aria-invalid={invalid("customerMessage")}
                required
              />
              <FieldDescription>
                Paste it as received. It is stored as untrusted input.
              </FieldDescription>
              <FieldError>{errors.customerMessage}</FieldError>
            </Field>
            <Field data-invalid={invalid("requestedAmount")}>
              <FieldLabel htmlFor="requestedAmount">
                Requested amount (optional)
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="requestedAmount"
                  name="requestedAmount"
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-invalid={invalid("requestedAmount")}
                />
              </InputGroup>
              <FieldDescription>Up to {amountLabel}.</FieldDescription>
              <FieldError>{errors.requestedAmount}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="supportingDetails">
                Merchant notes (optional)
              </FieldLabel>
              <Textarea
                id="supportingDetails"
                name="supportingDetails"
                rows={2}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? "Creating…" : "Create case"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
