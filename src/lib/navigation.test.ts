import { describe, expect, test } from "bun:test"

import { breadcrumbLabel, isActivePath } from "@/lib/navigation"

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
    expect(breadcrumbLabel(segments, 0)).toBe("Resolution Inbox")
    expect(breadcrumbLabel(segments, 1)).toBe("Case")
  })
})
