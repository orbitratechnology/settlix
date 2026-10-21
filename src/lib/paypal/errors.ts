/**
 * How a failed PayPal call must be treated:
 * - `rejected`: PayPal definitely did not act (400/401/403/404/422).
 * - `retry_later`: not processed yet; retry with the SAME PayPal-Request-Id (409, 429, GET 5xx).
 * - `unknown`: PayPal MAY have acted (timeout, network error, POST 5xx, unparseable 2xx).
 *   For refunds this means RECOVERY_REQUIRED and reconciliation, never a new request ID.
 */
export type PayPalFailureKind = "rejected" | "retry_later" | "unknown"

export class PayPalError extends Error {
  constructor(
    readonly kind: PayPalFailureKind,
    readonly httpStatus: number | undefined,
    readonly errorName: string | undefined,
    readonly issues: string[],
    readonly debugId: string | undefined,
    message: string,
  ) {
    super(message)
    this.name = "PayPalError"
  }

  get issue(): string | undefined {
    return this.issues[0]
  }

  /** Safe to log: no tokens, headers, or buyer data. */
  toLogObject() {
    return {
      kind: this.kind,
      httpStatus: this.httpStatus,
      errorName: this.errorName,
      issues: this.issues,
      debugId: this.debugId,
    }
  }
}

export function classifyFailure(
  method: "GET" | "POST",
  status: number,
  issues: string[],
): PayPalFailureKind {
  if (status === 409 || status === 429) return "retry_later"
  if (status >= 500) return method === "GET" ? "retry_later" : "unknown"
  if (issues.includes("PREVIOUS_REQUEST_IN_PROGRESS")) return "retry_later"
  return "rejected"
}
