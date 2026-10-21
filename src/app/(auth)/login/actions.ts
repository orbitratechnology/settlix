"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { safeRedirectPath } from "@/lib/routes"
import { createClient } from "@/lib/supabase/server"

export type SignInState = {
  error?: string
  email?: string
}

const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
  next: z.string().max(512).optional(),
})

export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  })
  if (!parsed.success) {
    return {
      error: "Enter a valid email address and password.",
      email: String(formData.get("email") ?? ""),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    // Same message for unknown email and wrong password.
    return { error: "Incorrect email or password.", email: parsed.data.email }
  }

  redirect(safeRedirectPath(parsed.data.next))
}
