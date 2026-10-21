import { InfoIcon } from "lucide-react"

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
import { cn } from "@/lib/utils"

/**
 * Merchant sign-in form. Fields are disabled until Supabase Auth is connected,
 * so nothing (including a password) can be submitted from this placeholder.
 */
export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Sign in to Settlix</CardTitle>
          <CardDescription>Use your merchant workspace account</CardDescription>
        </CardHeader>
        <CardContent>
          <form>
            <FieldGroup>
              <Alert>
                <InfoIcon />
                <AlertTitle>Sign-in is not connected yet</AlertTitle>
                <AlertDescription>
                  Supabase authentication is added in the next build phase.
                </AlertDescription>
              </Alert>
              <Field data-disabled>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="merchant@example.com"
                  disabled
                  required
                />
              </Field>
              <Field data-disabled>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  disabled
                  required
                />
              </Field>
              <Field>
                <Button type="submit" disabled>
                  Sign in
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        Settlix is a hackathon demo that runs against the PayPal Sandbox. No
        real payments are processed.
      </FieldDescription>
    </div>
  )
}
