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
      for (const path of ["/", "/login"]) await audit(page, path)
      await context.close()
    })
  })
}
