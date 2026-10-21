import { describe, expect, test } from "bun:test"

import { isActivePath } from "@/lib/navigation"

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
