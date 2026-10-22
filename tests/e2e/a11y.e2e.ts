import { randomBytes } from "node:crypto"

import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import {
  adminDb,
  createSeedCase,
  E2E_MERCHANT_ID,
  E2E_POLICY_ID,
} from "./workspace"

/**
 * Automated accessibility check (WCAG 2.1 A/AA rules in axe-core) on every
 * screen, signed in and signed out, in light and dark mode. Serious and
 * critical findings fail the test; the rest are printed.
 */
async function audit(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState("networkidle")
  // Measure the page at rest: contrast mid-fade isn't what anyone reads.
  // Looping animations (spinners, skeleton pulses) never finish; skip them.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  )
  await page.waitForTimeout(500)
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const summary = results.violations.map(
    (v) =>
      `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes
        .slice(0, 3)
        .map((n) => `${n.target.join(" ")} — ${n.failureSummary ?? ""}`)
        .join(" | ")}`,
  )
  if (summary.length) console.log(`${path}\n  ${summary.join("\n  ")}`)
  expect(
    results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    ),
    `${path}: ${summary.join("; ")}`,
  ).toEqual([])
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test.use({ colorScheme })

    test("signed-in screens", async ({ page }) => {
      const created = await createSeedCase(adminDb(), {
        description: "Linen tea towels (E2E fixture)",
        amountMinor: 1800,
        capturedDaysAgo: 4,
        case: {
          customer_display_name: "E2E Customer",
          request_category: "damaged_item",
          claimed_issue: "One towel arrived torn",
          customer_message: "One of the towels arrived with a torn hem.",
          requested_amount_minor: 600,
          supporting_details: null,
        },
      })
      // A case with an investigation, checks, a refund, and a receipt, when a
      // live run has left one in the E2E workspace.
      const { data: refunded } = await adminDb()
        .from("cases")
        .select("id")
        .eq("merchant_id", E2E_MERCHANT_ID)
        .eq("status", "REFUNDED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      for (const path of [
        ...(refunded
          ? [`/cases/${refunded.id}`, `/receipts/${refunded.id}`]
          : []),
        "/dashboard",
        "/cases",
        `/cases/${created.id}`,
        `/receipts/${created.id}`,
        "/policies",
        `/policies/${E2E_POLICY_ID}`,
        "/payments",
        "/request-form",
        "/cases/emails",
        "/settings",
        "/this-page-does-not-exist",
      ]) {
        await audit(page, path)
      }
    })

    test("signed-out screens", async ({ browser }) => {
      const context = await browser.newContext({
        storageState: undefined,
        colorScheme,
      })
      const page = await context.newPage()
      // A customer's status page, with a message from the store on it.
      const db = adminDb()
      const created = await createSeedCase(db, {
        description: "Linen apron (E2E fixture)",
        amountMinor: 3800,
        capturedDaysAgo: 3,
        case: {
          customer_display_name: "E2E Customer",
          request_category: "damaged_item",
          claimed_issue: "The seam tore",
          customer_message: "The seam tore open on the first wash.",
          requested_amount_minor: null,
          supporting_details: null,
        },
      })
      const token = randomBytes(32).toString("hex")
      await db
        .from("cases")
        .update({ status_token: token })
        .eq("id", created.id)
      await db.from("case_messages").insert([
        {
          merchant_id: E2E_MERCHANT_ID,
          case_id: created.id,
          sender: "customer",
          channel: "form",
          body: "The seam tore open on the first wash.",
        },
        {
          merchant_id: E2E_MERCHANT_ID,
          case_id: created.id,
          sender: "settlix",
          channel: "status_page",
          body: "We have your request and will look at it shortly.",
        },
      ])
      for (const path of [
        "/",
        "/login",
        "/r/settlix-e2e",
        `/status/${token}?sent=1`,
      ]) {
        await audit(page, path)
      }
      await context.close()
    })
  })
}
