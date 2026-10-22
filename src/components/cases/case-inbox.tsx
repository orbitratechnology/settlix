"use client"

import { useState } from "react"
import Link from "next/link"
import { SearchIcon, XIcon } from "lucide-react"

import { CaseStatusBadge, OriginBadge } from "@/components/status-badges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  defaultInboxFilters,
  filterInbox,
  inboxCounts,
  type InboxFilters,
  type InboxRow,
  type InboxSort,
  type InboxView,
} from "@/lib/cases/inbox"
import {
  caseStatusMeta,
  proposedActionMeta,
  requestCategoryLabels,
  type CaseStatus,
} from "@/lib/domain/labels"
import { formatDate } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"
import { cn } from "@/lib/utils"

const QUICK_VIEWS = ["all", "attention", "open"] as const
const quickViewLabels = {
  all: "All",
  attention: "Needs attention",
  open: "Still open",
} as const

const sortItems: { label: string; value: InboxSort }[] = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Largest amount", value: "amount_desc" },
  { label: "Smallest amount", value: "amount_asc" },
]

const categoryItems = [
  { label: "Any reason", value: "all" },
  ...Object.entries(requestCategoryLabels).map(([value, label]) => ({
    label,
    value,
  })),
]

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  )
}

/**
 * Refund requests (FR-03): search, quick views, filter by stage and reason,
 * and sort, over stored rows. Each row opens the request.
 */
export function CaseInbox({
  rows,
  initialView = "all",
}: {
  rows: InboxRow[]
  initialView?: InboxView
}) {
  const [filters, setFilters] = useState<InboxFilters>({
    ...defaultInboxFilters,
    view: initialView,
  })
  const counts = inboxCounts(rows)
  const visible = filterInbox(rows, filters)
  const update = (patch: Partial<InboxFilters>) =>
    setFilters((current) => ({ ...current, ...patch }))
  const filtered =
    filters.query !== "" || filters.view !== "all" || filters.category !== "all"

  const statusItems = [
    { label: "Any stage", value: "any" },
    ...(Object.keys(caseStatusMeta) as CaseStatus[]).map((status) => ({
      label: `${caseStatusMeta[status].label} (${counts.byStatus[status]})`,
      value: status,
    })),
  ]
  const statusValue = (QUICK_VIEWS as readonly string[]).includes(filters.view)
    ? "any"
    : filters.view

  return (
    <div className="flex flex-col gap-5">
      <div
        role="group"
        aria-label="Quick views"
        className="flex flex-wrap gap-2"
      >
        {QUICK_VIEWS.map((view) => {
          const active = filters.view === view
          return (
            <button
              key={view}
              type="button"
              aria-pressed={active}
              onClick={() => update({ view })}
              className={cn(
                "flex h-10 items-center gap-2 rounded-full border px-4 text-[0.9375rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "bg-background hover:bg-muted",
              )}
            >
              {quickViewLabels[view]}
              <span
                className={cn(
                  "rounded-full px-2 text-sm",
                  active ? "bg-background/20" : "bg-muted",
                )}
              >
                {counts[view]}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid gap-2 @2xl/main:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search requests"
            placeholder="Search by customer, order, or problem"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
          />
        </InputGroup>
        <Select
          items={statusItems}
          value={statusValue}
          onValueChange={(value) =>
            update({
              view:
                value === "any" || value === null
                  ? "all"
                  : (value as CaseStatus),
            })
          }
        >
          <SelectTrigger aria-label="Stage" className="w-full @2xl/main:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={categoryItems}
          value={filters.category}
          onValueChange={(value) =>
            update({
              category: (value ?? "all") as InboxFilters["category"],
            })
          }
        >
          <SelectTrigger aria-label="Reason" className="w-full @2xl/main:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={sortItems}
          value={filters.sort}
          onValueChange={(value) =>
            update({ sort: (value ?? "newest") as InboxSort })
          }
        >
          <SelectTrigger aria-label="Sort" className="w-full @2xl/main:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {sortItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status">
          Showing {visible.length} of {rows.length} requests
        </p>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters(defaultInboxFilters)}
          >
            <XIcon data-icon="inline-start" />
            Clear filters
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No requests match</EmptyTitle>
            <EmptyDescription>
              Try another search, or clear the filters to see every request.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() => setFilters(defaultInboxFilters)}
            >
              <XIcon data-icon="inline-start" />
              Clear filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="gap-0 py-2">
          <ul className="flex flex-col divide-y">
            {visible.map((row) => (
              <InboxItem key={row.id} row={row} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

const channelNotes: Record<InboxRow["channel"], string> = {
  dashboard: "",
  form: ", sent through your form",
  email: ", from Gmail",
}

function InboxItem({ row }: { row: InboxRow }) {
  const urgent = row.priority === "high" || row.priority === "urgent"
  return (
    <li>
      <Link
        href={`/cases/${row.id}`}
        className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 px-4 py-4 outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-6 @3xl/main:grid-cols-[2.5rem_minmax(0,1fr)_14rem_7rem_6.5rem] @3xl/main:items-center"
      >
        <span
          aria-hidden
          className="row-span-2 flex size-10 items-center justify-center rounded-full bg-field text-sm font-semibold text-accent-foreground @3xl/main:row-span-1"
        >
          {initials(row.customer)}
        </span>

        <span className="col-start-2 row-start-1 flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-semibold">
              {row.customer}
            </span>
            {urgent ? (
              <Badge variant="warning">
                {row.priority === "urgent" ? "Urgent" : "High priority"}
              </Badge>
            ) : null}
            <OriginBadge origin={row.origin} />
          </span>
          <span className="truncate text-[0.9375rem]">{row.claimedIssue}</span>
          <span className="truncate text-sm text-muted-foreground">
            {requestCategoryLabels[row.category]}, request {row.caseNumber}
            {channelNotes[row.channel]}
          </span>
        </span>

        <span className="col-span-2 col-start-2 row-start-2 flex flex-col items-start gap-1 @3xl/main:col-span-1 @3xl/main:col-start-3 @3xl/main:row-start-1">
          <CaseStatusBadge status={row.status} />
          <span className="text-sm text-muted-foreground">
            {row.latestAction
              ? `Claude: ${proposedActionMeta[row.latestAction].label.toLowerCase()}`
              : "Not checked yet"}
          </span>
        </span>

        <span className="col-start-3 row-start-1 text-right @3xl/main:col-start-4">
          {row.requestedMinor === null ? (
            <span className="text-sm text-muted-foreground">No amount</span>
          ) : (
            <span className="text-base font-semibold">
              {formatMoney(row.requestedMinor, row.currency)}
            </span>
          )}
        </span>

        <span className="hidden text-right text-sm text-muted-foreground @3xl/main:col-start-5 @3xl/main:row-start-1 @3xl/main:block">
          {formatDate(row.createdAt)}
        </span>
      </Link>
    </li>
  )
}
