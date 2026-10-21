"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

import { CaseStatusBadge, OriginBadge } from "@/components/status-badges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  defaultInboxFilters,
  filterInbox,
  inboxCounts,
  needsAttention,
  type InboxFilters,
  type InboxRow,
  type InboxSort,
} from "@/lib/cases/inbox"
import {
  caseStatusMeta,
  proposedActionMeta,
  requestCategoryLabels,
  type CaseStatus,
} from "@/lib/domain/labels"
import { formatDate } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"

const QUICK_VIEWS = ["all", "attention", "open"] as const

const sortItems: { label: string; value: InboxSort }[] = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Highest amount", value: "amount_desc" },
  { label: "Lowest amount", value: "amount_asc" },
]

const categoryItems = [
  { label: "All categories", value: "all" },
  ...Object.entries(requestCategoryLabels).map(([value, label]) => ({
    label,
    value,
  })),
]

function SortButton({
  label,
  active,
  descending,
  onClick,
}: {
  label: string
  active: boolean
  descending: boolean
  onClick: () => void
}) {
  const Icon = !active
    ? ArrowUpDownIcon
    : descending
      ? ArrowDownIcon
      : ArrowUpIcon
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-mx-2 h-7 px-2"
      onClick={onClick}
    >
      {label}
      <Icon data-icon="inline-end" className={active ? "" : "opacity-50"} />
    </Button>
  )
}

/**
 * Resolution Inbox (FR-03): search, filter by status and category, sort by
 * date and amount, status counts, and attention indicators over stored rows.
 */
export function CaseInbox({ rows }: { rows: InboxRow[] }) {
  const [filters, setFilters] = useState<InboxFilters>(defaultInboxFilters)
  const counts = inboxCounts(rows)
  const visible = filterInbox(rows, filters)
  const update = (patch: Partial<InboxFilters>) =>
    setFilters((current) => ({ ...current, ...patch }))
  const filtered =
    filters.query !== "" || filters.view !== "all" || filters.category !== "all"

  const statusItems = [
    { label: "Any status", value: "any" },
    ...(Object.keys(caseStatusMeta) as CaseStatus[]).map((status) => ({
      label: `${caseStatusMeta[status].label} (${counts.byStatus[status]})`,
      value: status,
    })),
  ]
  const statusValue = (QUICK_VIEWS as readonly string[]).includes(filters.view)
    ? "any"
    : filters.view

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={
            (QUICK_VIEWS as readonly string[]).includes(filters.view)
              ? [filters.view]
              : []
          }
          onValueChange={(value: string[]) =>
            update({ view: (value[0] as InboxFilters["view"]) ?? "all" })
          }
          aria-label="Quick views"
          className="flex-wrap"
        >
          <ToggleGroupItem value="all">All · {counts.all}</ToggleGroupItem>
          <ToggleGroupItem value="attention">
            Needs attention · {counts.attention}
          </ToggleGroupItem>
          <ToggleGroupItem value="open">Open · {counts.open}</ToggleGroupItem>
        </ToggleGroup>

        <div className="grid gap-2 @2xl/main:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search cases"
              placeholder="Search case, customer, order, or issue"
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
            <SelectTrigger
              aria-label="Status"
              className="w-full @2xl/main:w-52"
            >
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
            <SelectTrigger
              aria-label="Category"
              className="w-full @2xl/main:w-44"
            >
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
            <SelectTrigger aria-label="Sort" className="w-full @2xl/main:w-40">
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
      </div>

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No cases match</EmptyTitle>
            <EmptyDescription>
              Try another search or clear the filters.
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
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Case</TableHead>
                  <TableHead className="hidden @3xl/main:table-cell">
                    Order
                  </TableHead>
                  <TableHead className="hidden @xl/main:table-cell">
                    Category
                  </TableHead>
                  <TableHead
                    className="text-right"
                    aria-sort={
                      filters.sort === "amount_desc"
                        ? "descending"
                        : filters.sort === "amount_asc"
                          ? "ascending"
                          : "none"
                    }
                  >
                    <SortButton
                      label="Requested"
                      active={filters.sort.startsWith("amount")}
                      descending={filters.sort !== "amount_asc"}
                      onClick={() =>
                        update({
                          sort:
                            filters.sort === "amount_desc"
                              ? "amount_asc"
                              : "amount_desc",
                        })
                      }
                    />
                  </TableHead>
                  <TableHead className="hidden @2xl/main:table-cell">
                    Recommendation
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead
                    className="hidden pr-4 text-right @4xl/main:table-cell"
                    aria-sort={
                      filters.sort === "newest"
                        ? "descending"
                        : filters.sort === "oldest"
                          ? "ascending"
                          : "none"
                    }
                  >
                    <SortButton
                      label="Created"
                      active={
                        filters.sort === "newest" || filters.sort === "oldest"
                      }
                      descending={filters.sort !== "oldest"}
                      onClick={() =>
                        update({
                          sort: filters.sort === "newest" ? "oldest" : "newest",
                        })
                      }
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <InboxTableRow key={row.id} row={row} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground" role="status">
        Showing {visible.length} of {rows.length} cases
        {filtered ? (
          <>
            {" · "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => setFilters(defaultInboxFilters)}
            >
              Clear filters
            </button>
          </>
        ) : null}
      </p>
    </div>
  )
}

function InboxTableRow({ row }: { row: InboxRow }) {
  const attention = needsAttention(row)
  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {attention ? (
              <CircleAlertIcon
                className="size-4 shrink-0 text-warning"
                aria-label="Needs attention"
              />
            ) : null}
            <Link
              href={`/cases/${row.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.caseNumber}
            </Link>
            {row.priority === "high" || row.priority === "urgent" ? (
              <Badge variant="warning">
                {row.priority === "urgent" ? "Urgent" : "High"}
              </Badge>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">{row.customer}</span>
        </div>
      </TableCell>
      <TableCell className="hidden @3xl/main:table-cell">
        {row.orderReference}
      </TableCell>
      <TableCell className="hidden @xl/main:table-cell">
        {requestCategoryLabels[row.category]}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.requestedMinor === null ? (
          <span className="text-muted-foreground">Not stated</span>
        ) : (
          formatMoney(row.requestedMinor, row.currency)
        )}
      </TableCell>
      <TableCell className="hidden @2xl/main:table-cell">
        {row.latestAction ? (
          <Badge variant={proposedActionMeta[row.latestAction].tone}>
            {proposedActionMeta[row.latestAction].label}
          </Badge>
        ) : (
          <span className="text-muted-foreground">Not investigated</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <CaseStatusBadge status={row.status} />
          <OriginBadge origin={row.origin} />
        </div>
      </TableCell>
      <TableCell className="hidden pr-4 text-right text-muted-foreground @4xl/main:table-cell">
        {formatDate(row.createdAt)}
      </TableCell>
    </TableRow>
  )
}
