/**
 * Sandbox test catalog. Prices live on the server; the browser only ever sends
 * an item ID, never an amount (PRD §14.2).
 */
export type CatalogItem = {
  id: string
  name: string
  description: string
  amountMinor: number
  currency: "USD"
}

export const sandboxCatalog: CatalogItem[] = [
  {
    id: "pour-over-set",
    name: "Stoneware pour-over coffee set",
    description: "Ceramic dripper, glass carafe, two mugs",
    amountMinor: 8900,
    currency: "USD",
  },
  {
    id: "bamboo-bath-mat",
    name: "Bamboo bath mat",
    description: "Quick-dry slatted mat",
    amountMinor: 4200,
    currency: "USD",
  },
  {
    id: "linen-napkins",
    name: "Linen napkins, set of 4",
    description: "Stonewashed natural linen",
    amountMinor: 2400,
    currency: "USD",
  },
]

export function findCatalogItem(id: string) {
  return sandboxCatalog.find((item) => item.id === id) ?? null
}
