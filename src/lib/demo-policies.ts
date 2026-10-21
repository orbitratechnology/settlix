import type { ClauseType } from "@/lib/domain/labels"

export type DemoClause = {
  clause_key: string
  clause_type: ClauseType
  position: number
  title: string
  content: string
}

/**
 * Clause text of the seeded "Standard Return Policy" versions. Shared by the
 * seed script and the AI eval fixtures so both use the exact same wording.
 */
export const standardPolicyV1Clauses: DemoClause[] = [
  {
    clause_key: "RW-1",
    clause_type: "return_window",
    position: 1,
    title: "Return window",
    content:
      "Refund requests must be submitted within 14 days of the order's capture date.",
  },
  {
    clause_key: "FR-1",
    clause_type: "full_refund",
    position: 2,
    title: "Damaged on arrival",
    content:
      "Items that arrive damaged are eligible for a full refund after the item is returned.",
  },
]

export const standardPolicyV2Clauses: DemoClause[] = [
  {
    clause_key: "RW-1",
    clause_type: "return_window",
    position: 1,
    title: "Return window",
    content:
      "Refund requests must be submitted within 30 days of the order's capture date. Requests received after 30 days are not eligible for a refund unless a manual-review condition applies.",
  },
  {
    clause_key: "FR-1",
    clause_type: "full_refund",
    position: 2,
    title: "Damaged or defective on arrival",
    content:
      "If an item arrives damaged or defective, the customer is eligible for a full refund of the item price once they provide at least one photo showing the damage. Damaged items valued under $100 do not need to be returned.",
  },
  {
    clause_key: "FR-2",
    clause_type: "full_refund",
    position: 3,
    title: "Wrong item shipped",
    content:
      "If we shipped the wrong item, the customer is eligible for a full refund. The customer must return the incorrect item using the prepaid label we provide.",
  },
  {
    clause_key: "FR-3",
    clause_type: "full_refund",
    position: 4,
    title: "Item not received",
    content:
      "If carrier tracking shows no delivery 10 days after the estimated delivery date, the customer is eligible for a full refund.",
  },
  {
    clause_key: "PR-1",
    clause_type: "partial_refund",
    position: 5,
    title: "Minor cosmetic defects",
    content:
      "For minor cosmetic defects that do not affect function, such as light scratches or scuffs, we offer a partial refund of up to 25% of the item price if the customer keeps the item. A photo of the defect is required.",
  },
  {
    clause_key: "PR-2",
    clause_type: "partial_refund",
    position: 6,
    title: "Missing parts or accessories",
    content:
      "If a component or accessory is missing, we refund the listed price of the missing part, up to 30% of the order total.",
  },
  {
    clause_key: "EX-1",
    clause_type: "exclusion",
    position: 7,
    title: "Final-sale and personalized items",
    content:
      "Items marked final sale, gift cards, and personalized or engraved items are not eligible for change-of-mind refunds. Damage and wrong-item claims still apply.",
  },
  {
    clause_key: "EX-2",
    clause_type: "exclusion",
    position: 8,
    title: "Change of mind",
    content:
      "Change-of-mind returns are accepted within the return window only for unused items in their original packaging, and the refund is issued after the item is returned. Original shipping costs are not refunded.",
  },
  {
    clause_key: "EV-1",
    clause_type: "evidence_requirement",
    position: 9,
    title: "Evidence for damage and defect claims",
    content:
      "Damage, defect, and cosmetic claims require at least one clear photo of the item and the issue. Without a photo the request stays open until evidence is provided.",
  },
  {
    clause_key: "EV-2",
    clause_type: "evidence_requirement",
    position: 10,
    title: "Evidence for non-delivery",
    content:
      "Non-delivery claims are checked against the carrier tracking record before a refund is approved.",
  },
  {
    clause_key: "MR-1",
    clause_type: "manual_review",
    position: 11,
    title: "Manual review",
    content:
      "A merchant must manually review refund requests above $500, a customer's third refund request within 90 days, and any request where the customer's statements conflict with order or tracking records.",
  },
]
