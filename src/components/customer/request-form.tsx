"use client"

import { useActionState, useState } from "react"
import { AlertCircleIcon, SendIcon, SparklesIcon } from "lucide-react"

import { submitRefundRequest } from "@/app/(customer)/r/[slug]/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  customerReasons,
  type RequestFormState,
  type RequestFormValues,
} from "@/lib/intake/form"

export type DemoOrder = { reference: string; email: string; item: string }

/**
 * The customer's refund request: order number, email, what happened, and their
 * own words. No account, no captcha; the order number and email together are
 * the check.
 */
export function RequestForm({
  slug,
  storeName,
  initialOrder,
  via,
  demoOrders,
  currencySymbol,
}: {
  slug: string
  storeName: string
  initialOrder: string
  via: string | null
  demoOrders: DemoOrder[]
  currencySymbol: string
}) {
  const [state, formAction, pending] = useActionState<
    RequestFormState,
    FormData
  >(submitRefundRequest.bind(null, slug), { attempt: 0 })
  const [prefill, setPrefill] = useState<{
    values: Partial<RequestFormValues>
    version: number
  }>({ values: { order: initialOrder }, version: 0 })

  // After an error the form remounts with what the customer typed.
  const values: Partial<RequestFormValues> = state.values ?? prefill.values
  const errors = state.fieldErrors ?? {}
  const invalid = (name: keyof RequestFormValues) =>
    errors[name] ? true : undefined

  return (
    <form
      key={`${state.attempt}-${prefill.version}`}
      action={formAction}
      className="flex flex-col gap-8"
      noValidate
    >
      {demoOrders.length > 0 ? (
        <Alert>
          <SparklesIcon />
          <AlertTitle>This is a demo store</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>
              Try it with a demo order. Nothing is charged or refunded; the
              request shows up in the demo store&apos;s dashboard.
            </span>
            <span className="flex flex-wrap gap-2">
              {demoOrders.map((order) => (
                <Button
                  key={order.reference}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPrefill((current) => ({
                      values: {
                        order: order.reference,
                        email: order.email,
                      },
                      version: current.version + 1,
                    }))
                  }
                >
                  Use {order.reference} ({order.item})
                </Button>
              ))}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {state.error ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertCircleIcon />
          <AlertTitle>Your request wasn&apos;t sent yet</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <input type="hidden" name="via" value={via ?? ""} />
      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <FieldSet>
        <FieldLegend>Your order</FieldLegend>
        <FieldDescription>
          So {storeName} can find it. Both must match the order.
        </FieldDescription>
        <FieldGroup>
          <Field data-invalid={invalid("order")}>
            <FieldLabel htmlFor="order">Order number</FieldLabel>
            <Input
              id="order"
              name="order"
              defaultValue={values.order}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="e.g. HP-10452"
              aria-invalid={invalid("order")}
              required
            />
            <FieldDescription>
              On your order confirmation. The Transaction ID from PayPal&apos;s
              receipt email works too.
            </FieldDescription>
            <FieldError>{errors.order}</FieldError>
          </Field>
          <Field data-invalid={invalid("email")}>
            <FieldLabel htmlFor="email">Email you used for the order</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              defaultValue={values.email}
              aria-invalid={invalid("email")}
              required
            />
            <FieldError>{errors.email}</FieldError>
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet data-invalid={invalid("reason")}>
        <FieldLegend>What happened?</FieldLegend>
        <RadioGroup
          name="reason"
          defaultValue={values.reason || undefined}
          aria-invalid={invalid("reason")}
          className="grid gap-2 sm:grid-cols-2"
        >
          {customerReasons.map((reason) => (
            <FieldLabel
              key={reason.value}
              htmlFor={`reason-${reason.value}`}
              className="rounded-xl"
            >
              <Field orientation="horizontal">
                <RadioGroupItem
                  id={`reason-${reason.value}`}
                  value={reason.value}
                />
                <FieldContent>
                  <FieldTitle className="text-[0.9375rem] font-normal">
                    {reason.label}
                  </FieldTitle>
                </FieldContent>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
        <FieldError>{errors.reason}</FieldError>
      </FieldSet>

      <FieldGroup>
        <Field data-invalid={invalid("details")}>
          <FieldLabel htmlFor="details">Tell us more</FieldLabel>
          <Textarea
            id="details"
            name="details"
            rows={5}
            defaultValue={values.details}
            placeholder="What's wrong, and when did you notice? If you have photos, say so: the store may ask for them."
            aria-invalid={invalid("details")}
            required
          />
          <FieldError>{errors.details}</FieldError>
        </Field>
        <Field data-invalid={invalid("amount")}>
          <FieldLabel htmlFor="amount">Amount (optional)</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>{currencySymbol}</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="Full refund"
              defaultValue={values.amount}
              aria-invalid={invalid("amount")}
            />
          </InputGroup>
          <FieldDescription>
            Leave it empty to ask for a full refund.
          </FieldDescription>
          <FieldError>{errors.amount}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="name">Your name (optional)</FieldLabel>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            defaultValue={values.name}
          />
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-fit">
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SendIcon data-icon="inline-start" />
          )}
          {pending ? "Sending…" : "Send request"}
        </Button>
        <p className="text-sm text-muted-foreground">
          {storeName} sees your message and order. Settlix checks the order,
          and Claude (an AI) helps the store review your request. A person at
          the store makes the decision.
        </p>
      </div>
    </form>
  )
}
