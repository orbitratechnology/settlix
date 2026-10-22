import { z } from "zod"

import type { RequestCategory } from "@/lib/domain/labels"
import { Constants } from "@/types/database"

/** The reasons as a customer would say them, in the order the form lists them. */
export const customerReasons: { value: RequestCategory; label: string }[] = [
  { value: "damaged_item", label: "It arrived damaged or broken" },
  { value: "not_received", label: "It never arrived" },
  { value: "wrong_item", label: "I got the wrong item" },
  { value: "missing_parts", label: "Something is missing" },
  { value: "not_as_described", label: "It isn't as described" },
  { value: "changed_mind", label: "I changed my mind" },
  { value: "other", label: "Something else" },
]

export const requestFormSchema = z.object({
  order: z
    .string()
    .trim()
    .min(3, "Enter your order number.")
    .max(80, "That doesn't look like an order number."),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email("Enter the email address you used for the order.")),
  name: z.string().trim().max(120).optional(),
  reason: z.enum(Constants.public.Enums.request_category, {
    error: "Choose what happened.",
  }),
  details: z
    .string()
    .trim()
    .min(10, "Tell the store a little more (at least a sentence).")
    .max(3000, "Keep it under 3,000 characters."),
  amount: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\d+(\.\d{1,2})?)?$/, "Use an amount like 12.50.")
    .optional(),
  via: z.string().trim().max(32).optional(),
  // Honeypot: hidden from people, filled in by bots.
  website: z.string().max(0).optional(),
})

export type RequestFormValues = {
  order: string
  email: string
  name: string
  reason: string
  details: string
  amount: string
}

export type RequestFormState = {
  attempt: number
  error?: string
  fieldErrors?: Partial<Record<keyof RequestFormValues, string>>
  values?: RequestFormValues
}

const VIA = /^[a-z][a-z0-9_-]{0,31}$/

/** A link's ?via= tag, kept only when it is a plain short tag. */
export function cleanVia(value: string | null | undefined): string | null {
  const via = value?.trim().toLowerCase()
  return via && VIA.test(via) ? via : null
}

export const replyFormSchema = z.object({
  text: z
    .string()
    .trim()
    .min(2, "Write your reply first.")
    .max(1500, "Keep it under 1,500 characters."),
})
