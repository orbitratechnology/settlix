import { Suspense } from "react"
import type { Metadata } from "next"

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
        description="Workspace details and preferences."
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
    { label: "Investigate cases", allowed: can.investigate(role) },
    { label: "Approve sandbox refunds", allowed: can.approveRefunds(role) },
    { label: "Manage return policies", allowed: can.managePolicies(role) },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Workspace
          {workspace.isDemo ? <Badge variant="outline">Demo</Badge> : null}
        </CardTitle>
        <CardDescription>
          Every case, order, policy, and refund belongs to this workspace.
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
              The sandbox demo processes {workspace.defaultCurrency} payments.
            </FieldDescription>
          </Field>
          <Field>
            <FieldTitle>Your role</FieldTitle>
            <div className="flex flex-wrap gap-2">
              <Badge>{roleLabels[role]}</Badge>
              {permissions.map((permission) => (
                <Badge
                  key={permission.label}
                  variant={permission.allowed ? "secondary" : "outline"}
                >
                  {permission.allowed ? "Can" : "Cannot"}{" "}
                  {permission.label.toLowerCase()}
                </Badge>
              ))}
            </div>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
