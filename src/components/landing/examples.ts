import { standardPolicyV2Clauses } from "@/lib/demo-policies"
import { formatMoney } from "@/lib/money/amounts"

/**
 * Example requests for the landing page, taken from the seeded demo store and
 * its "Standard Return Policy" (the quotes are the clause text, verbatim).
 * They illustrate what the app shows; nothing here is a live AI result or a
 * PayPal record.
 */

function clause(key: string) {
  const found = standardPolicyV2Clauses.find((c) => c.clause_key === key)
  if (!found) throw new Error(`Unknown demo clause ${key}`)
  return found
}

export type ExampleCheck = { label: string; ok: boolean }

export type ExampleRequest = {
  id: string
  customer: string
  initials: string
  item: string
  paidMinor: number
  issue: string
  decision: {
    label: string
    tone: "ready" | "review"
    action: string
    amountMinor: number | null
  }
  checks: ExampleCheck[]
  quote: { key: string; title: string; text: string }
}

const usd = (minor: number) => formatMoney(minor, "USD")

const fullRefund = clause("FR-1")
const cosmetic = clause("PR-1")
const review = clause("MR-1")

export const exampleRequests: ExampleRequest[] = [
  {
    id: "maya",
    customer: "Maya Chen",
    initials: "MC",
    item: "Pour-over coffee set",
    paidMinor: 8900,
    issue: "Carafe arrived cracked and leaks",
    decision: {
      label: "Ready to approve",
      tone: "ready",
      action: "Full refund",
      amountMinor: 8900,
    },
    checks: [
      { label: `Paid with PayPal, ${usd(8900)} left to refund`, ok: true },
      { label: "Asked 3 days after paying, inside 30 days", ok: true },
      { label: "Two photos show the crack", ok: true },
    ],
    quote: {
      key: fullRefund.clause_key,
      title: fullRefund.title,
      text: "If an item arrives damaged or defective, the customer is eligible for a full refund of the item price once they provide at least one photo showing the damage.",
    },
  },
  {
    id: "jonas",
    customer: "Jonas Weber",
    initials: "JW",
    item: "Walnut desk organizer",
    paidMinor: 24000,
    issue: "Scratch across the top surface",
    decision: {
      label: "Ready to approve",
      tone: "ready",
      action: "Partial refund",
      amountMinor: 6000,
    },
    checks: [
      { label: `Paid with PayPal, ${usd(24000)} left to refund`, ok: true },
      { label: `Asks for ${usd(6000)}, the 25% the policy allows`, ok: true },
      { label: "One photo shows the scratch", ok: true },
    ],
    quote: {
      key: cosmetic.clause_key,
      title: cosmetic.title,
      text: "For minor cosmetic defects that do not affect function, such as light scratches or scuffs, we offer a partial refund of up to 25% of the item price if the customer keeps the item.",
    },
  },
  {
    id: "grace",
    customer: "Grace Kim",
    initials: "GK",
    item: "Bamboo bath mat",
    paidMinor: 4200,
    issue: "Says it never arrived, and that it's falling apart",
    decision: {
      label: "Needs your review",
      tone: "review",
      action: "A person decides",
      amountMinor: null,
    },
    checks: [
      { label: `Paid with PayPal, ${usd(4200)} left to refund`, ok: true },
      { label: "The two claims contradict each other", ok: false },
      { label: "Carrier tracking shows it was delivered", ok: false },
    ],
    quote: {
      key: review.clause_key,
      title: review.title,
      text: "A merchant must manually review … any request where the customer's statements conflict with order or tracking records.",
    },
  },
]

/** The one example that the lifecycle and the documents follow. */
export const featured = {
  caseNumber: "DEMO-101",
  customer: "Maya Chen",
  firstName: "Maya",
  item: "Pour-over coffee set",
  order: "HP-10421",
  issue: "Carafe arrived cracked and leaks",
  amount: usd(8900),
  quote: exampleRequests[0].quote,
}

export { usd }

/** The seeded demo merchant the examples come from. */
export const demoStore = "Harbor & Pine Supply Co."
