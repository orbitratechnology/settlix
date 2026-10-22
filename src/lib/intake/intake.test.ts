import { describe, expect, test } from "bun:test"

import { classifyRequest, cleanSubject, summarizeIssue } from "./classify"
import { customerStatus } from "./customer-status"
import {
  acknowledgementMessage,
  firstName,
  mailtoHref,
  replySubject,
  requestFormUrl,
  statusUrl,
  withStatusLink,
} from "./messages"
import {
  findReferenceCandidates,
  ilikeExact,
  nameFromEmail,
  normalizeOrderReference,
} from "./references"
import { isStatusToken, newStatusToken } from "./tokens"
import type { RequestCategory } from "@/lib/domain/labels"
import { Constants } from "@/types/database"

describe("order references", () => {
  test("normalizes what customers type", () => {
    expect(normalizeOrderReference(" #hp-10421 ")).toBe("HP-10421")
    expect(normalizeOrderReference("4S172867UT322280T")).toBe(
      "4S172867UT322280T",
    )
    expect(normalizeOrderReference("SBX FB92B37F")).toBe("SBXFB92B37F")
    expect(normalizeOrderReference("ab")).toBeNull()
    expect(normalizeOrderReference("HP%10421")).toBeNull()
    expect(normalizeOrderReference("")).toBeNull()
  })

  test("escapes LIKE wildcards for exact matching", () => {
    expect(ilikeExact("A_B%C\\D")).toBe("A\\_B\\%C\\\\D")
  })

  test("finds order numbers and PayPal IDs in an email, not words or prices", () => {
    expect(
      findReferenceCandidates(
        "Hi, my order #HP-10421 arrived cracked. PayPal transaction 4S172867UT322280T. I paid $89.00 on 10/12 and my phone is 5550123.",
      ),
    ).toEqual(["HP-10421", "4S172867UT322280T", "5550123"])
    expect(findReferenceCandidates("Please refund me, thanks")).toEqual([])
    expect(findReferenceCandidates("HP-10421 and hp-10421")).toEqual([
      "HP-10421",
    ])
  })

  test("derives a readable name from an email address", () => {
    expect(nameFromEmail("sam.rivera@example.com")).toBe("Sam Rivera")
    expect(nameFromEmail("d_okafor42@example.com")).toBe("D Okafor")
    expect(nameFromEmail("123@example.com")).toBe("Customer")
  })
})

describe("classifyRequest", () => {
  const cases: [string, RequestCategory][] = [
    ["My parcel never arrived and tracking is stuck", "not_received"],
    ["It still hasn't arrived after two weeks", "not_received"],
    ["You sent me the wrong size", "wrong_item"],
    ["The lid is missing from the box", "missing_parts"],
    ["The carafe arrived cracked and leaks", "damaged_item"],
    ["The kettle doesn't work anymore", "damaged_item"],
    ["The colour is not as described on the website", "not_as_described"],
    ["I changed my mind, can I return it?", "changed_mind"],
    ["Can you help with my order?", "other"],
  ]
  for (const [text, category] of cases) {
    test(`"${text}" → ${category}`, () => {
      expect(classifyRequest(text)).toBe(category)
    })
  }
})

describe("issue summary", () => {
  test("uses a meaningful subject, minus reply prefixes", () => {
    expect(cleanSubject("Re: Fwd:  Cracked   carafe")).toBe("Cracked carafe")
    expect(summarizeIssue("RE: Cracked carafe", "Hello")).toBe(
      "Cracked carafe",
    )
  })

  test("falls back to the first sentence when the subject says nothing", () => {
    expect(
      summarizeIssue(
        "Refund",
        "The apron's stitching came apart after one wash. Can I get my money back?",
      ),
    ).toBe("The apron's stitching came apart after one wash.")
    expect(summarizeIssue(null, "")).toBe("Refund request")
  })
})

describe("customerStatus", () => {
  test("covers every case status without exposing internals", () => {
    for (const status of Constants.public.Enums.case_status) {
      const view = customerStatus(status, null)
      expect(view.title.length).toBeGreaterThan(0)
      expect(`${view.title} ${view.detail}`).not.toMatch(/claude|ai\b|check/i)
    }
  })

  test("only a refunded request says refunded, with PayPal's amount", () => {
    expect(customerStatus("REFUNDED", { amount: "$38.00" })).toMatchObject({
      stage: "refunded",
      title: "$38.00 refunded",
      tone: "success",
    })
    expect(customerStatus("REFUND_PENDING", null).title).not.toMatch(
      /refunded/i,
    )
    expect(customerStatus("RECOVERY_REQUIRED", null).stage).toBe("decided")
  })

  test("asks for information only while the store is waiting on it", () => {
    expect(customerStatus("NEEDS_EVIDENCE", null)).toMatchObject({
      tone: "attention",
      canAddInfo: true,
    })
    expect(customerStatus("REFUND_PENDING", null).canAddInfo).toBe(false)
  })
})

describe("status tokens", () => {
  test("are 64 random hex characters", () => {
    const a = newStatusToken()
    expect(isStatusToken(a)).toBe(true)
    expect(a).not.toBe(newStatusToken())
    expect(isStatusToken("abc")).toBe(false)
    expect(isStatusToken(a.toUpperCase())).toBe(false)
  })
})

describe("messages", () => {
  const origin = "https://settlix.example"

  test("builds form and status links", () => {
    expect(
      requestFormUrl(origin, "harbor-pine-demo", {
        via: "qr",
        order: "HP-10452",
      }),
    ).toBe("https://settlix.example/r/harbor-pine-demo?order=HP-10452&via=qr")
    expect(statusUrl(origin, "a".repeat(64))).toBe(
      `https://settlix.example/status/${"a".repeat(64)}`,
    )
  })

  test("acknowledgement names the request, the order and the link", () => {
    const message = acknowledgementMessage({
      storeName: "Harbor & Pine",
      customerName: "Sam Rivera",
      caseNumber: "STX-1100",
      orderReference: "HP-10452",
      statusUrl: `${origin}/status/x`,
    })
    expect(message.subject).toBe("Your refund request STX-1100")
    expect(message.body).toStartWith("Hi Sam,")
    expect(message.body).toContain("HP-10452")
    expect(message.body).toContain(`${origin}/status/x`)
  })

  test("reply subjects and status links are added once", () => {
    expect(replySubject("STX-1", null)).toBe("Re: Your refund request STX-1")
    expect(replySubject("STX-1", "Re: Broken")).toBe("Re: Broken")
    expect(withStatusLink("Hello", "https://x/s")).toBe(
      "Hello\n\nFollow your request or reply here: https://x/s",
    )
    expect(withStatusLink("See https://x/s", "https://x/s")).toBe(
      "See https://x/s",
    )
    expect(withStatusLink(" Hello ", null)).toBe("Hello")
    expect(firstName("  ")).toBe("there")
  })

  test("mailto links encode spaces and keep the address readable", () => {
    expect(
      mailtoHref({ to: "a.b@example.com", subject: "Re: x y", body: "Hi\nyou" }),
    ).toBe("mailto:a.b@example.com?subject=Re%3A%20x%20y&body=Hi%0Ayou")
    expect(
      mailtoHref({ to: "a@b.co", subject: "s", body: "x".repeat(5000) })
        .length,
    ).toBeLessThan(2000)
  })
})
