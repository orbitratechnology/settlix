import { describe, expect, test } from "bun:test"

import {
  parseInboxView,
  defaultInboxFilters,
  filterInbox,
  inboxCounts,
  type InboxRow,
} from "@/lib/cases/inbox"

const row = (overrides: Partial<InboxRow>): InboxRow => ({
  id: crypto.randomUUID(),
  caseNumber: "DEMO-100",
  customer: "Customer",
  claimedIssue: "Issue",
  category: "damaged_item",
  requestedMinor: 1000,
  currency: "USD",
  status: "NEW",
  priority: "normal",
  origin: "seed",
  channel: "dashboard",
  createdAt: "2026-10-10T00:00:00.000Z",
  orderReference: "HP-1",
  latestAction: null,
  latestOutcome: null,
  ...overrides,
})

const rows = [
  row({
    caseNumber: "DEMO-101",
    customer: "Maya Chen",
    requestedMinor: 8900,
    createdAt: "2026-10-18T00:00:00.000Z",
  }),
  row({
    caseNumber: "DEMO-104",
    customer: "Daniel Okafor",
    status: "NEEDS_REVIEW",
    priority: "high",
    category: "not_as_described",
    requestedMinor: 78000,
    createdAt: "2026-10-19T00:00:00.000Z",
  }),
  row({
    caseNumber: "STX-1023",
    customer: "Jordan Lee",
    orderReference: "SBX-FB92B37F",
    status: "REFUNDED",
    requestedMinor: null,
    origin: "app",
    createdAt: "2026-10-21T00:00:00.000Z",
  }),
]

describe("filterInbox", () => {
  test("searches case number, customer, order, and issue", () => {
    const search = (query: string) =>
      filterInbox(rows, { ...defaultInboxFilters, query }).map(
        (r) => r.caseNumber,
      )
    expect(search("okafor")).toEqual(["DEMO-104"])
    expect(search("sbx-fb92")).toEqual(["STX-1023"])
    expect(search("demo-10")).toEqual(["DEMO-104", "DEMO-101"])
  })

  test("filters by view and category", () => {
    const view = (v: Parameters<typeof filterInbox>[1]["view"]) =>
      filterInbox(rows, { ...defaultInboxFilters, view: v }).map(
        (r) => r.caseNumber,
      )
    expect(view("attention")).toEqual(["DEMO-104"])
    expect(view("open")).toEqual(["DEMO-104", "DEMO-101"])
    expect(view("REFUNDED")).toEqual(["STX-1023"])
    expect(
      filterInbox(rows, {
        ...defaultInboxFilters,
        category: "not_as_described",
      }).map((r) => r.caseNumber),
    ).toEqual(["DEMO-104"])
  })

  test("sorts by date and by amount, missing amounts last", () => {
    const sort = (s: Parameters<typeof filterInbox>[1]["sort"]) =>
      filterInbox(rows, { ...defaultInboxFilters, sort: s }).map(
        (r) => r.caseNumber,
      )
    expect(sort("newest")).toEqual(["STX-1023", "DEMO-104", "DEMO-101"])
    expect(sort("oldest")).toEqual(["DEMO-101", "DEMO-104", "STX-1023"])
    expect(sort("amount_desc")).toEqual(["DEMO-104", "DEMO-101", "STX-1023"])
    expect(sort("amount_asc")).toEqual(["DEMO-101", "DEMO-104", "STX-1023"])
  })

  test("does not mutate the input", () => {
    const copy = [...rows]
    filterInbox(rows, { ...defaultInboxFilters, sort: "oldest" })
    expect(rows).toEqual(copy)
  })
})

describe("inboxCounts", () => {
  test("counts every status, attention, and open cases", () => {
    const counts = inboxCounts(rows)
    expect(counts.all).toBe(3)
    expect(counts.attention).toBe(1)
    expect(counts.open).toBe(2)
    expect(counts.byStatus.NEW).toBe(1)
    expect(counts.byStatus.RECOVERY_REQUIRED).toBe(0)
  })
})

describe("parseInboxView", () => {
  test("accepts quick views and statuses from the URL", () => {
    expect(parseInboxView("attention")).toBe("attention")
    expect(parseInboxView("READY_FOR_APPROVAL")).toBe("READY_FOR_APPROVAL")
    expect(parseInboxView(["NEW", "open"])).toBe("NEW")
  })

  test("falls back to all requests", () => {
    expect(parseInboxView(undefined)).toBe("all")
    expect(parseInboxView("toString")).toBe("all")
    expect(parseInboxView("not-a-view")).toBe("all")
  })
})
