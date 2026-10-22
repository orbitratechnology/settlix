import { afterEach, describe, expect, test } from "bun:test"

import {
  requestedTestFault,
  TEST_FAULT_HEADER,
  testFaultsEnabled,
} from "@/lib/testing/faults"

const savedEnv = { ...process.env }

function setEnv(name: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>
  if (value === undefined) delete env[name]
  else env[name] = value
}

const request = (fault?: string) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    headers: fault ? { [TEST_FAULT_HEADER]: fault } : {},
  })

afterEach(() => {
  process.env = { ...savedEnv }
})

describe("test faults", () => {
  test("are off unless SETTLIX_TEST_FAULTS=1", () => {
    setEnv("SETTLIX_TEST_FAULTS", undefined)
    expect(testFaultsEnabled()).toBe(false)
    expect(requestedTestFault(request("ai_timeout"))).toBeNull()
  })

  test("are never on in production, even with the switch", () => {
    setEnv("SETTLIX_TEST_FAULTS", "1")
    setEnv("NODE_ENV", "production")
    expect(testFaultsEnabled()).toBe(false)
    expect(requestedTestFault(request("paypal_lost_response"))).toBeNull()
  })

  test("accept only the named scenarios", () => {
    setEnv("SETTLIX_TEST_FAULTS", "1")
    setEnv("NODE_ENV", "test")
    expect(requestedTestFault(request("paypal_lost_response"))).toBe(
      "paypal_lost_response",
    )
    expect(requestedTestFault(request("REFUND_AMOUNT_EXCEEDED"))).toBeNull()
    expect(requestedTestFault(request())).toBeNull()
  })
})
