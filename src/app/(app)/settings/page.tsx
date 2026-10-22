import { Suspense } from "react"
import type { Metadata } from "next"
import { CircleCheckIcon, CircleMinusIcon } from "lucide-react"

import { ModeToggle } from "@/components/mode-toggle"
import { PageContainer, PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
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
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { can, requireMember } from "@/lib/security/auth"

export const metadata: Metadata = {
  title: "Settings",
}

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="Your store, your role, and how Settlix looks."
      />

      <div className="grid items-start gap-4 @4xl/main:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
          <WorkspaceCard />
        </Suspense>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Light, dark, or match your system.
            </CardDescription>
            <CardAction>
              <ModeToggle />
            </CardAction>
          </CardHeader>
        </Card>
      </div>
    </PageContainer>
  )
}

const roleLabels = {
  owner: "Owner",
  admin: "Admin",
  reviewer: "Reviewer",
  support: "Support",
} as const

async function WorkspaceCard() {
  const member = await requireMember()
  const { workspace, role } = member

  const permissions = [
    { label: "Check requests with Claude", allowed: can.investigate(role) },
    { label: "Approve refunds", allowed: can.approveRefunds(role) },
    { label: "Manage return policies", allowed: can.managePolicies(role) },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Your store
          {workspace.isDemo ? <Badge variant="outline">Demo</Badge> : null}
        </CardTitle>
        <CardDescription>
          Every request, order, policy, and refund belongs to this store.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-disabled>
            <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
            <Input id="workspace-name" defaultValue={workspace.name} disabled />
          </Field>
          <Field data-disabled>
            <FieldLabel htmlFor="workspace-currency">
              Default currency
            </FieldLabel>
            <Input
              id="workspace-currency"
              defaultValue={workspace.defaultCurrency}
              disabled
            />
            <FieldDescription>
              Test payments in this store are in {workspace.defaultCurrency}.
            </FieldDescription>
          </Field>
          <Field>
            <FieldTitle>Your role</FieldTitle>
            <p className="text-lg font-semibold">{roleLabels[role]}</p>
            <ul className="flex flex-col gap-2.5">
              {permissions.map((permission) => (
                <li
                  key={permission.label}
                  className="flex items-center gap-2.5 text-[0.9375rem]"
                >
                  {permission.allowed ? (
                    <CircleCheckIcon
                      aria-hidden
                      className="size-5 shrink-0 text-success"
                    />
                  ) : (
                    <CircleMinusIcon
                      aria-hidden
                      className="size-5 shrink-0 text-muted-foreground"
                    />
                  )}
                  <span>
                    <span className="sr-only">
                      {permission.allowed ? "Allowed: " : "Not allowed: "}
                    </span>
                    {permission.label}
                  </span>
                </li>
              ))}
            </ul>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
