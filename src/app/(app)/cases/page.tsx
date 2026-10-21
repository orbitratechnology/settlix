import type { Metadata } from "next"
import Link from "next/link"
import { CreditCardIcon, InboxIcon, PlusIcon, SearchIcon } from "lucide-react"

import { PageContainer, PageHeader } from "@/components/page-header"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

export const metadata: Metadata = {
  title: "Resolution Inbox",
}

export default function CasesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Resolution Inbox"
        description="Prioritize, investigate, and resolve customer refund requests."
        actions={
          <Button disabled>
            <PlusIcon data-icon="inline-start" />
            New case
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <InputGroup className="max-w-sm" data-disabled>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search cases, customers, orders…"
              aria-label="Search cases"
              disabled
            />
          </InputGroup>
        </CardHeader>
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>No refund cases yet</EmptyTitle>
              <EmptyDescription>
                Cases appear here once they are created from a mapped PayPal
                Sandbox payment or loaded as labeled demo data.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link
                href="/payments"
                className={buttonVariants({ variant: "outline" })}
              >
                <CreditCardIcon data-icon="inline-start" />
                Go to Payments
              </Link>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </PageContainer>
  )
}
