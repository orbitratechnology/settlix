import type { PayPalMoney } from "./money"

// Only the fields Settlix reads (Orders v2 / Payments v2 OpenAPI specs).

export type OrderStatus =
  | "CREATED"
  | "SAVED"
  | "APPROVED"
  | "VOIDED"
  | "COMPLETED"
  | "PAYER_ACTION_REQUIRED"

export type CaptureStatus =
  | "COMPLETED"
  | "DECLINED"
  | "PARTIALLY_REFUNDED"
  | "PENDING"
  | "REFUNDED"
  | "FAILED"

export type RefundStatus = "CANCELLED" | "FAILED" | "PENDING" | "COMPLETED"

export type PayPalLink = { href: string; rel: string; method?: string }

export type PayPalCapture = {
  id: string
  status: CaptureStatus
  status_details?: { reason?: string }
  amount: PayPalMoney
  custom_id?: string
  create_time?: string
  update_time?: string
  supplementary_data?: { related_ids?: { order_id?: string } }
}

export type PayPalRefund = {
  id: string
  status: RefundStatus
  status_details?: { reason?: string }
  amount?: PayPalMoney
  custom_id?: string
  create_time?: string
  update_time?: string
  seller_payable_breakdown?: {
    gross_amount?: PayPalMoney
    total_refunded_amount?: PayPalMoney
  }
  links?: PayPalLink[]
}

export type PayPalOrder = {
  id: string
  status: OrderStatus
  /** The buyer, once they approved the order. */
  payer?: {
    email_address?: string
    name?: { given_name?: string; surname?: string }
  }
  purchase_units?: {
    reference_id?: string
    custom_id?: string
    amount?: PayPalMoney
    payments?: { captures?: PayPalCapture[]; refunds?: PayPalRefund[] }
  }[]
  links?: PayPalLink[]
}
