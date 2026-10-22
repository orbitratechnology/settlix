/**
 * Public demo account for hackathon judges. It belongs to the seeded demo
 * workspace only, every payment action is PayPal Sandbox, and the credentials
 * are intentionally shown on the sign-in page. It is not a secret.
 */
export const DEMO_ACCOUNT = {
  email: "demo@settlix.example",
  password: "settlix-sandbox-demo",
} as const

/**
 * Demo orders without a request yet, so anyone can try the demo store's public
 * request form. They are seeded demo records (no PayPal payment), shown as a
 * hint on the form of demo workspaces only.
 */
export const DEMO_FORM_ORDERS = [
  {
    reference: "HP-10452",
    email: "sam.rivera@example.com",
    name: "Sam Rivera",
    description: "Linen apron, charcoal",
    amountMinor: 3800,
    capturedDaysAgo: 4,
  },
  {
    reference: "HP-10458",
    email: "ana.souza@example.com",
    name: "Ana Souza",
    description: "Gooseneck pour-over kettle, matte black",
    amountMinor: 6400,
    capturedDaysAgo: 9,
  },
] as const
