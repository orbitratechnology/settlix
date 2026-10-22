/**
 * One-off: fills in the buyer's email and name on sandbox payments recorded
 * before Settlix kept them (Phase 9), by reading each order back from PayPal.
 * New captures store the buyer themselves. Read-only towards PayPal.
 *
 *   bun --conditions=react-server scripts/backfill-order-buyers.ts
 */
import { buyerFromPayer } from "../src/lib/payments/capture-evaluation"
import { getPayPalOrder } from "../src/lib/paypal/orders"
import { createAdminClient } from "../src/lib/supabase/admin"

const admin = createAdminClient()

const { data: orders, error } = await admin
  .from("orders")
  .select("id, merchant_id, external_order_reference, paypal_order_id")
  .eq("origin", "app")
  .is("customer_email", null)
  .not("paypal_order_id", "is", null)
  .in("payment_state", ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"])
if (error) throw error

let updated = 0
for (const order of orders) {
  try {
    const buyer = buyerFromPayer(
      (await getPayPalOrder(order.paypal_order_id!)).payer,
    )
    if (!buyer) {
      console.log(`  ${order.external_order_reference}: no buyer email`)
      continue
    }
    const { error: updateError } = await admin
      .from("orders")
      .update({ customer_email: buyer.email, customer_name: buyer.name })
      .eq("id", order.id)
      .eq("merchant_id", order.merchant_id)
      .is("customer_email", null)
    if (updateError) throw updateError
    updated += 1
  } catch (cause) {
    console.log(
      `  ${order.external_order_reference}: skipped (${cause instanceof Error ? cause.message : "error"})`,
    )
  }
}
console.log(`Buyer details added to ${updated} of ${orders.length} payments.`)
