"use client"

import { useActionState, useState } from "react"
import { AlertCircleIcon, PencilIcon, PlusIcon } from "lucide-react"

import {
  createPolicy,
  saveClause,
  updatePolicyDraft,
  type PolicyFormState,
} from "@/app/(app)/policies/actions"
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
import { clauseTypeLabels, type ClauseType } from "@/lib/domain/labels"

export type PolicyDetailsDefaults = {
  description: string
  returnWindowDays: string
  manualReviewAbove: string
  effectiveFrom: string
  effectiveUntil: string
}

function FormError({
  state,
  title,
}: {
  state: PolicyFormState
  title: string
}) {
  if (!state.error) return null
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  )
}

function DetailsFields({
  defaults,
  errors,
  idPrefix,
}: {
  defaults: PolicyDetailsDefaults
  errors: Partial<Record<string, string>>
  idPrefix: string
}) {
  const invalid = (name: string) => (errors[name] ? true : undefined)
  const id = (name: string) => `${idPrefix}-${name}`
  return (
    <>
      <Field data-invalid={invalid("description")}>
        <FieldLabel htmlFor={id("description")}>
          Description (optional)
        </FieldLabel>
        <Textarea
          id={id("description")}
          name="description"
          rows={2}
          defaultValue={defaults.description}
          aria-invalid={invalid("description")}
        />
        <FieldError>{errors.description}</FieldError>
      </Field>
      <div className="@container">
        <div className="grid gap-4 @md:grid-cols-2">
          <Field data-invalid={invalid("returnWindowDays")}>
            <FieldLabel htmlFor={id("returnWindowDays")}>
              Return window (days)
            </FieldLabel>
            <Input
              id={id("returnWindowDays")}
              name="returnWindowDays"
              inputMode="numeric"
              defaultValue={defaults.returnWindowDays}
              aria-invalid={invalid("returnWindowDays")}
            />
            <FieldDescription>Checked by Settlix, not the AI.</FieldDescription>
            <FieldError>{errors.returnWindowDays}</FieldError>
          </Field>
          <Field data-invalid={invalid("manualReviewAbove")}>
            <FieldLabel htmlFor={id("manualReviewAbove")}>
              Review requests above
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>$</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id={id("manualReviewAbove")}
                name="manualReviewAbove"
                inputMode="decimal"
                placeholder="Optional"
                defaultValue={defaults.manualReviewAbove}
                aria-invalid={invalid("manualReviewAbove")}
              />
            </InputGroup>
            <FieldDescription>
              Higher amounts always need a merchant.
            </FieldDescription>
            <FieldError>{errors.manualReviewAbove}</FieldError>
          </Field>
          <Field data-invalid={invalid("effectiveFrom")}>
            <FieldLabel htmlFor={id("effectiveFrom")}>
              Effective from
            </FieldLabel>
            <Input
              id={id("effectiveFrom")}
              name="effectiveFrom"
              type="date"
              required
              defaultValue={defaults.effectiveFrom}
              aria-invalid={invalid("effectiveFrom")}
            />
            <FieldError>{errors.effectiveFrom}</FieldError>
          </Field>
          <Field data-invalid={invalid("effectiveUntil")}>
            <FieldLabel htmlFor={id("effectiveUntil")}>
              Effective until (optional)
            </FieldLabel>
            <Input
              id={id("effectiveUntil")}
              name="effectiveUntil"
              type="date"
              defaultValue={defaults.effectiveUntil}
              aria-invalid={invalid("effectiveUntil")}
            />
            <FieldError>{errors.effectiveUntil}</FieldError>
          </Field>
        </div>
      </div>
    </>
  )
}

/** Starts a brand-new policy as a draft (version 1). */
export function NewPolicyDialog({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState<
    PolicyFormState,
    FormData
  >(createPolicy, {})
  const errors = state.fieldErrors ?? {}

  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        New policy
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form action={formAction} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>New return policy</DialogTitle>
            <DialogDescription>
              It starts as a draft. Add clauses, then publish it to make it
              active.
            </DialogDescription>
          </DialogHeader>
          <FormError state={state} title="Policy not created" />
          <FieldGroup>
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor="new-policy-name">Name</FieldLabel>
              <Input
                id="new-policy-name"
                name="name"
                required
                autoComplete="off"
                aria-invalid={errors.name ? true : undefined}
              />
              <FieldError>{errors.name}</FieldError>
            </Field>
            <DetailsFields
              idPrefix="new-policy"
              errors={errors}
              defaults={{
                description: "",
                returnWindowDays: "30",
                manualReviewAbove: "",
                effectiveFrom: today,
                effectiveUntil: "",
              }}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? "Creating…" : "Create draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Inline editor for a draft version's details. */
export function PolicyDetailsForm({
  policyId,
  defaults,
}: {
  policyId: string
  defaults: PolicyDetailsDefaults
}) {
  const [state, formAction, pending] = useActionState<
    PolicyFormState,
    FormData
  >(updatePolicyDraft.bind(null, policyId), {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError state={state} title="Not saved" />
      <FieldGroup>
        <DetailsFields
          idPrefix="policy"
          errors={state.fieldErrors ?? {}}
          defaults={defaults}
        />
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? "Saving…" : "Save details"}
        </Button>
        {state.saved && !pending ? (
          <span role="status" className="text-sm text-muted-foreground">
            Saved.
          </span>
        ) : null}
      </div>
    </form>
  )
}

const clauseTypeItems = [
  { label: "Choose a type", value: null },
  ...Object.entries(clauseTypeLabels).map(([value, label]) => ({
    label,
    value,
  })),
]

export type ClauseDefaults = {
  id: string
  clauseKey: string
  title: string
  clauseType: ClauseType
  content: string
}

/** Adds a clause to a draft, or edits one when `clause` is given. */
export function ClauseDialog({
  policyId,
  clause,
}: {
  policyId: string
  clause?: ClauseDefaults
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<
    PolicyFormState,
    FormData
  >(async (previous, formData) => {
    const result = await saveClause(policyId, previous, formData)
    if (result.saved) setOpen(false)
    return result
  }, {})
  const errors = state.fieldErrors ?? {}
  const invalid = (name: string) => (errors[name] ? true : undefined)
  const prefix = `clause-${clause?.id ?? "new"}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          clause ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Edit clause ${clause.clauseKey}`}
            />
          ) : (
            <Button size="sm" variant="outline" />
          )
        }
      >
        {clause ? (
          <>
            <PencilIcon data-icon="inline-start" />
            Edit
          </>
        ) : (
          <>
            <PlusIcon data-icon="inline-start" />
            Add clause
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form action={formAction} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{clause ? "Edit clause" : "Add a clause"}</DialogTitle>
            <DialogDescription>
              Investigations cite clauses by their ID and quote this text word
              for word.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="clauseId" value={clause?.id ?? ""} />
          <FormError state={state} title="Clause not saved" />
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field data-invalid={invalid("clauseKey")}>
                <FieldLabel htmlFor={`${prefix}-key`}>Clause ID</FieldLabel>
                <Input
                  id={`${prefix}-key`}
                  name="clauseKey"
                  required
                  placeholder="FR-1"
                  autoComplete="off"
                  className="font-mono uppercase"
                  defaultValue={clause?.clauseKey}
                  aria-invalid={invalid("clauseKey")}
                />
                <FieldError>{errors.clauseKey}</FieldError>
              </Field>
              <Field data-invalid={invalid("clauseType")}>
                <FieldLabel htmlFor={`${prefix}-type`}>Type</FieldLabel>
                <Select
                  items={clauseTypeItems}
                  name="clauseType"
                  defaultValue={clause?.clauseType ?? null}
                >
                  <SelectTrigger
                    id={`${prefix}-type`}
                    aria-invalid={invalid("clauseType")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {clauseTypeItems.map((item) => (
                        <SelectItem key={item.label} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError>{errors.clauseType}</FieldError>
              </Field>
            </div>
            <Field data-invalid={invalid("title")}>
              <FieldLabel htmlFor={`${prefix}-title`}>Title</FieldLabel>
              <Input
                id={`${prefix}-title`}
                name="title"
                required
                defaultValue={clause?.title}
                aria-invalid={invalid("title")}
              />
              <FieldError>{errors.title}</FieldError>
            </Field>
            <Field data-invalid={invalid("content")}>
              <FieldLabel htmlFor={`${prefix}-content`}>Clause text</FieldLabel>
              <Textarea
                id={`${prefix}-content`}
                name="content"
                rows={5}
                required
                defaultValue={clause?.content}
                aria-invalid={invalid("content")}
              />
              <FieldError>{errors.content}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? "Saving…" : "Save clause"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
