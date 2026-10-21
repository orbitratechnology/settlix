import type { Metadata } from "next"

import { ModeToggle } from "@/components/mode-toggle"
import { PageContainer, PageHeader } from "@/components/page-header"
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
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

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

      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>
              Every case, order, policy, and refund belongs to this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-disabled>
                <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
                <Input
                  id="workspace-name"
                  defaultValue="Demo Merchant"
                  disabled
                />
              </Field>
              <Field data-disabled>
                <FieldLabel htmlFor="workspace-currency">
                  Default currency
                </FieldLabel>
                <Input id="workspace-currency" defaultValue="USD" disabled />
                <FieldDescription>
                  The sandbox demo processes USD payments.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

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
