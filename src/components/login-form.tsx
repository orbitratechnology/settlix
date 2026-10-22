"use client"

import { useActionState, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertCircleIcon, FlaskConicalIcon } from "lucide-react"

import { signIn, type SignInState } from "@/app/(auth)/login/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { DEMO_ACCOUNT } from "@/lib/demo"
import { cn } from "@/lib/utils"

/** Reads the post-login `next` path; must render inside <Suspense>. */
export function LoginFormWithRedirect() {
  const next = useSearchParams().get("next")
  return <LoginForm next={next} />
}

export function LoginForm({
  next,
  className,
  ...props
}: { next: string | null } & React.ComponentProps<"div">) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signIn,
    {},
  )
  const [email, setEmail] = useState(state.email ?? "")
  const [password, setPassword] = useState("")

  function fillDemoAccount() {
    setEmail(DEMO_ACCOUNT.email)
    setPassword(DEMO_ACCOUNT.password)
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
          <CardDescription>
            Use your store&apos;s Settlix account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <FieldGroup>
              {state.error ? (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>Sign-in failed</AlertTitle>
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              ) : null}
              {next ? <input type="hidden" name="next" value={next} /> : null}
              <Field data-invalid={state.error ? true : undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="merchant@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={state.error ? true : undefined}
                  required
                />
              </Field>
              <Field data-invalid={state.error ? true : undefined}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={state.error ? true : undefined}
                  required
                />
              </Field>
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  {pending ? "Signing in…" : "Sign in"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Alert>
        <FlaskConicalIcon />
        <AlertTitle>Want to look around?</AlertTitle>
        <AlertDescription>
          <p>
            Use the demo store: {DEMO_ACCOUNT.email}, password{" "}
            {DEMO_ACCOUNT.password}. It holds example requests and PayPal
            Sandbox test payments only.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={fillDemoAccount}
          >
            Fill in demo account
          </Button>
        </AlertDescription>
      </Alert>

      <FieldDescription>
        Settlix runs on the PayPal Sandbox. No real money moves.
      </FieldDescription>
    </div>
  )
}
