import type { Enums } from "@/types/database"

/** The `?via=` tags of the ready-made links, as the merchant would name them. */
export const sourceLabels: Record<string, string> = {
  qr: "QR code",
  print: "Printed card",
  email: "Email signature",
  receipt: "Order confirmation",
  site: "Website button",
  chat: "Messages and social",
}

export function sourceLabel(source: string | null): string | null {
  if (!source) return null
  return sourceLabels[source] ?? `Link tagged “${source}”`
}

/** How a request arrived, for the request page. */
export function channelLabel(
  channel: Enums<"case_channel">,
  source: string | null,
): string {
  if (channel === "email") return "An email to your Gmail"
  if (channel === "form") {
    const via = sourceLabel(source)
    return via ? `Your request form (${via})` : "Your request form"
  }
  return "Added in Settlix"
}

type Sender = Enums<"message_sender">
type Channel = Enums<"message_channel">

/** Who wrote a message and how it travelled, from the merchant's side. */
export function messageOrigin(sender: Sender, channel: Channel): string {
  if (sender === "customer") {
    if (channel === "form") return "Sent through your request form"
    if (channel === "gmail") return "Emailed you"
    return "Replied on their request page"
  }
  if (sender === "settlix") {
    return channel === "gmail"
      ? "Automatic confirmation, emailed from your Gmail"
      : "Automatic confirmation"
  }
  return channel === "gmail"
    ? "You emailed from Gmail"
    : "You posted on their request page"
}
