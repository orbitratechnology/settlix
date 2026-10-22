import { describe, expect, test } from "bun:test"

import { breadcrumbLabel, breadcrumbs, isActivePath } from "@/lib/navigation"

describe("isActivePath", () => {
  test("matches the exact route", () => {
    expect(isActivePath("/cases", "/cases")).toBe(true)
  })

  test("matches nested routes", () => {
    expect(isActivePath("/cases/abc-123", "/cases")).toBe(true)
  })

  test("does not match routes that only share a prefix", () => {
    expect(isActivePath("/cases-archive", "/cases")).toBe(false)
  })

  test("is inactive while the pathname is unknown", () => {
    expect(isActivePath(null, "/cases")).toBe(false)
  })
})

describe("breadcrumbLabel", () => {
  test("labels sections and record pages without exposing raw IDs", () => {
    const segments = ["cases", "5eed0000-0000-4000-8000-000500000001"]
    expect(breadcrumbLabel(segments, 0)).toBe("Refund requests")
    expect(breadcrumbLabel(segments, 1)).toBe("Request")
  })
})

describe("breadcrumbs", () => {
  test("builds one crumb per segment", () => {
    expect(breadcrumbs("/policies/p1")).toEqual([
      { href: "/policies", label: "Return policies" },
      { href: "/policies/p1", label: "Policy" },
    ])
  })

  test("routes a receipt's trail through its case", () => {
    expect(breadcrumbs("/receipts/c1")).toEqual([
      { href: "/cases", label: "Refund requests" },
      { href: "/cases/c1", label: "Request" },
      { href: "/receipts/c1", label: "Receipt" },
    ])
  })
})
