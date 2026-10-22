import "server-only"

/**
 * Test-only fault injection for the end-to-end suite (PRD §17.3 E2E-06/07 and
 * the PayPal rejection path). It is active only when the server runs outside
 * production with SETTLIX_TEST_FAULTS=1; otherwise the header is ignored. A
 * request can only pick one of these named scenarios, never supply values.
 */
export const testFaults = [
  /** Claude doesn't answer in time. */
  "ai_timeout",
  /** Claude answers with a structure that fails validation. */
  "ai_invalid_output",
  /** PayPal processes the refund, but its response never reaches Settlix. */
  "paypal_lost_response",
  /** PayPal declines the refund (sandbox negative testing). */
  "paypal_refund_declined",
  /** PayPal answers 500, so the outcome is unknown (sandbox negative testing). */
  "paypal_server_error",
] as const

export type TestFault = (typeof testFaults)[number]

export const TEST_FAULT_HEADER = "x-settlix-test-fault"

export function testFaultsEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.SETTLIX_TEST_FAULTS === "1"
  )
}

/** The fault a request asks for, or null when faults are off or unknown. */
export function requestedTestFault(request: Request): TestFault | null {
  if (!testFaultsEnabled()) return null
  const value = request.headers.get(TEST_FAULT_HEADER)
  return testFaults.find((fault) => fault === value) ?? null
}

/** PayPal sandbox negative-testing codes (PayPal-Mock-Response) per fault. */
export const paypalMockCodes: Partial<Record<TestFault, string>> = {
  paypal_refund_declined: "REFUND_FAILED_INSUFFICIENT_FUNDS",
  paypal_server_error: "INTERNAL_SERVER_ERROR",
}
