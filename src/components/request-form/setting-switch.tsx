"use client"

import { useId, useOptimistic, useState, useTransition } from "react"

import { updateRequestFormSetting } from "@/app/(app)/request-form/actions"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"

/** An on/off store setting that saves as soon as it is flipped. */
export function SettingSwitch({
  setting,
  checked,
  label,
  description,
  disabledReason,
}: {
  setting: "formEnabled" | "autoCheck"
  checked: boolean
  label: string
  description: string
  disabledReason: string | null
}) {
  const id = useId()
  const [optimistic, setOptimistic] = useOptimistic(checked)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Field
      orientation="horizontal"
      data-disabled={disabledReason ? true : undefined}
      data-invalid={error ? true : undefined}
    >
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{disabledReason ?? description}</FieldDescription>
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldContent>
      <Switch
        id={id}
        checked={optimistic}
        disabled={Boolean(disabledReason) || pending}
        onCheckedChange={(next) =>
          startTransition(async () => {
            setError(null)
            setOptimistic(next)
            const result = await updateRequestFormSetting(setting, next)
            if (result.error) setError(result.error)
          })
        }
      />
    </Field>
  )
}
