/**
 * Customer intake against the real Supabase project (Phase 9): the public
 * request form, the customer's status page, store messages, and the Gmail sync
 * with a Google/Gmail double. Each run has its own merchants (see ./fixtures);
 * orders use fake TEST… IDs and @example.com buyers. Nothing reaches Google,
 * PayPal or Claude. Skipped without NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test"

import { encryptSecret } from "@/lib/gmail/crypto"
import { GMAIL_SCOPES } from "@/lib/gmail/oauth"
import type { GmailMessage } from "@/lib/gmail/parse"
import { syncGmail } from "@/lib/gmail/sync"
import { postStoreMessage } from "@/lib/intake/outbound"
import {
  findPublicStore,
  submitPublicRequest,
  type PublicRequestInput,
  type PublicStore,
} from "@/lib/intake/service"
import { getStatusPage, replyOnStatusPage } from "@/lib/intake/status-page"

import {
  adminClient,
  APPROVER_ID,
  createTestMerchant,
  integrationConfigured,
  type TestDb,
} from "./fixtures"

// Each test makes many round trips to the real database.
setDefaultTimeout(60_000)

const ORIGIN = "https://settlix.example"
const KEY = Buffer.alloc(32, 9)

async function createBuyerOrder(
  db: TestDb,
  merchantId: string,
  {
    email = "buyer@example.com",
    amountMinor = 3800,
    state = "CAPTURED" as const,
  } = {},
) {
  const suffix = crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 10)
    .toUpperCase()
  const { data, error } = await db
    .from("orders")
    .insert({
      merchant_id: merchantId,
      external_order_reference: `TEST-${suffix}`,
      paypal_order_id: `TESTORDER${suffix}`,
      paypal_capture_id: state === "CAPTURED" ? `TESTCAPTURE${suffix}` : null,
      description: "Linen apron (integration test)",
      original_amount_minor: amountMinor,
      currency_code: "USD",
      captured_at: new Date().toISOString(),
      payment_state: state,
      origin: "app",
      customer_email: email,
      customer_name: "Sam Rivera",
    })
    .select("id, external_order_reference, paypal_capture_id")
    .single()
  if (error) throw error
  return data
}

async function storeFor(db: TestDb, { demo }: { demo: boolean }) {
  const { merchantId, member } = await createTestMerchant(db)
  if (!demo) {
    const { error } = await db
      .from("merchants")
      .update({ is_demo: false })
      .eq("id", merchantId)
    if (error) throw error
  }
  const store = await findPublicStore(member.workspace.slug)
  if (!store) throw new Error("store not found")
  return { store, merchantId }
}

const visitor = () => crypto.randomUUID().replaceAll("-", "")

function input(overrides: Partial<PublicRequestInput>): PublicRequestInput {
  return {
    reference: "",
    email: "buyer@example.com",
    name: null,
    category: "damaged_item",
    details: "The apron's seam tore on the first wash. I have a photo.",
    amount: null,
    via: "qr",
    ...overrides,
  }
}

describe.skipIf(!integrationConfigured)("public request form", () => {
  let db: TestDb
  let store: PublicStore

  beforeAll(async () => {
    db = adminClient()
    ;({ store } = await storeFor(db, { demo: false }))
  })

  test("opens a request only for a paid order with the buyer's email", async () => {
    const order = await createBuyerOrder(db, store.id)
    const unpaid = await createBuyerOrder(db, store.id, {
      state: "AWAITING_CAPTURE" as never,
    })
    const v = visitor()

    for (const attempt of [
      input({
        reference: order.external_order_reference,
        email: "someone@example.com",
      }),
      input({ reference: "TEST-DOESNOTEXIST" }),
      input({ reference: unpaid.external_order_reference }),
    ]) {
      expect((await submitPublicRequest(store, attempt, v)).status).toBe(
        "no_match",
      )
    }

    const result = await submitPublicRequest(
      store,
      input({
        reference: ` #${order.external_order_reference.toLowerCase()} `,
        email: "Buyer@Example.com",
      }),
      v,
    )
    expect(result.status).toBe("created")
    if (result.status !== "created") return

    const { data: created } = await db
      .from("cases")
      .select(
        "status, channel, channel_source, customer_verified, customer_email, customer_display_name, status_token, request_category, claimed_issue, created_by",
      )
      .eq("id", result.caseId)
      .single()
    expect(created).toMatchObject({
      status: "NEW",
      channel: "form",
      channel_source: "qr",
      customer_verified: true,
      customer_email: "buyer@example.com",
      customer_display_name: "Sam Rivera",
      status_token: result.statusToken,
      request_category: "damaged_item",
      claimed_issue: "The apron's seam tore on the first wash.",
      created_by: null,
    })
    const { data: messages } = await db
      .from("case_messages")
      .select("sender, channel")
      .eq("case_id", result.caseId)
    expect(messages).toEqual([{ sender: "customer", channel: "form" }])
    const { data: audit } = await db
      .from("audit_events")
      .select("event_type, actor_type")
      .eq("case_id", result.caseId)
    expect(audit).toEqual([
      { event_type: "case.created", actor_type: "system" },
    ])
  })

  test("accepts the PayPal transaction ID and checks the amount", async () => {
    const order = await createBuyerOrder(db, store.id, { amountMinor: 3800 })
    const v = visitor()
    expect(
      await submitPublicRequest(
        store,
        input({ reference: order.paypal_capture_id!, amount: "38.01" }),
        v,
      ),
    ).toMatchObject({ status: "invalid_amount" })
    const result = await submitPublicRequest(
      store,
      input({ reference: order.paypal_capture_id!, amount: "12.50" }),
      v,
    )
    expect(result.status).toBe("created")
    if (result.status !== "created") return
    const { data } = await db
      .from("cases")
      .select("requested_amount_minor")
      .eq("id", result.caseId)
      .single()
    expect(data?.requested_amount_minor).toBe(1250)
  })

  test("a second message about an open request is added to it", async () => {
    const order = await createBuyerOrder(db, store.id)
    const first = await submitPublicRequest(
      store,
      input({ reference: order.external_order_reference }),
      visitor(),
    )
    const second = await submitPublicRequest(
      store,
      input({
        reference: order.external_order_reference,
        details: "Here is more: the stitching came loose along the pocket.",
      }),
      visitor(),
    )
    expect(first.status).toBe("created")
    expect(second).toMatchObject({ status: "added", check: false })
    if (first.status !== "created" || second.status !== "added") return
    expect(second.caseId).toBe(first.caseId)
    expect(second.statusToken).toBe(first.statusToken)

    const { data } = await db
      .from("cases")
      .select("customer_message")
      .eq("id", first.caseId)
      .single()
    expect(data?.customer_message).toContain(
      "[The customer added this through the request form,",
    )
    expect(data?.customer_message).toContain("along the pocket")
    const { count } = await db
      .from("case_messages")
      .select("id", { count: "exact", head: true })
      .eq("case_id", first.caseId)
    expect(count).toBe(2)
  })

  test("demo stores open a new request every time", async () => {
    const { store: demo } = await storeFor(db, { demo: true })
    const order = await createBuyerOrder(db, demo.id)
    const a = await submitPublicRequest(
      demo,
      input({ reference: order.external_order_reference }),
      visitor(),
    )
    const b = await submitPublicRequest(
      demo,
      input({ reference: order.external_order_reference }),
      visitor(),
    )
    expect(a.status).toBe("created")
    expect(b.status).toBe("created")
    if (a.status === "created" && b.status === "created") {
      expect(a.caseId).not.toBe(b.caseId)
    }
  })

  test("one visitor gets 10 attempts an hour", async () => {
    const v = visitor()
    for (let i = 0; i < 10; i += 1) {
      expect(
        (await submitPublicRequest(store, input({ reference: "TEST-NOPE" }), v))
          .status,
      ).toBe("no_match")
    }
    expect(
      (await submitPublicRequest(store, input({ reference: "TEST-NOPE" }), v))
        .status,
    ).toBe("rate_limited")
  })
})

describe.skipIf(!integrationConfigured)(
  "status page and store messages",
  () => {
    let db: TestDb
    let store: PublicStore

    beforeAll(async () => {
      db = adminClient()
      ;({ store } = await storeFor(db, { demo: false }))
    })

    async function newRequest() {
      const order = await createBuyerOrder(db, store.id)
      const result = await submitPublicRequest(
        store,
        input({ reference: order.external_order_reference }),
        visitor(),
      )
      if (result.status !== "created") throw new Error(result.status)
      return result
    }

    test("shows the customer's view only, and asks for information once the store did", async () => {
      const request = await newRequest()
      expect(await getStatusPage("0".repeat(64))).toBeNull()
      expect(await getStatusPage("not-a-token")).toBeNull()

      // Claude's check alone moved it to "needs evidence".
      await db
        .from("cases")
        .update({ status: "NEEDS_EVIDENCE" })
        .eq("id", request.caseId)
      let page = await getStatusPage(request.statusToken)
      expect(page).toMatchObject({
        storeName: store.name,
        caseNumber: request.caseNumber,
        status: "NEEDS_EVIDENCE",
        view: { stage: "reviewing", tone: "progress" },
      })
      expect(page?.messages).toHaveLength(1)
      expect(JSON.stringify(page)).not.toMatch(/claude|investigation|eligib/i)

      const sent = await postStoreMessage({
        admin: db,
        merchantId: store.id,
        caseId: request.caseId,
        body: "Could you send a photo of the seam?",
        author: { type: "user", id: APPROVER_ID },
        email: true,
        origin: ORIGIN,
      })
      // No Gmail here: posted on the page, and the reason it wasn't emailed.
      expect(sent).toMatchObject({
        posted: true,
        emailed: false,
        statusUrl: `${ORIGIN}/status/${request.statusToken}`,
      })
      expect(sent.emailError).toBeTruthy()

      page = await getStatusPage(request.statusToken)
      expect(page?.view.tone).toBe("attention")
      expect(page?.messages.at(-1)).toMatchObject({
        fromStore: true,
        emailed: false,
        body: "Could you send a photo of the seam?",
      })

      const reply = await replyOnStatusPage(
        request.statusToken,
        "Photo attached to my email, the seam is open along 4 cm.",
        visitor(),
      )
      expect(reply).toMatchObject({
        status: "sent",
        caseId: request.caseId,
        check: true,
      })
      const { data } = await db
        .from("cases")
        .select("customer_message")
        .eq("id", request.caseId)
        .single()
      expect(data?.customer_message).toContain("through the status page")
      expect((await getStatusPage(request.statusToken))?.view.tone).toBe(
        "progress",
      )
    })

    test("replies close once a refund is underway", async () => {
      const request = await newRequest()
      for (const status of [
        "INVESTIGATING",
        "READY_FOR_APPROVAL",
        "REFUND_PENDING",
      ] as const) {
        const { error } = await db
          .from("cases")
          .update({ status })
          .eq("id", request.caseId)
        if (error) throw error
      }
      expect(
        (await replyOnStatusPage(request.statusToken, "Any news?", visitor()))
          .status,
      ).toBe("closed")
      expect((await getStatusPage(request.statusToken))?.view).toMatchObject({
        stage: "decided",
        title: "Your refund was approved",
      })
    })
  },
)

type GmailCall = { method: string; url: URL; body: string }

/** Answers like Google's token endpoint and the Gmail API. */
function googleDouble(messages: Map<string, GmailMessage>) {
  const calls: GmailCall[] = []
  let listed: string[] = []
  let tokenAnswer: () => Response = () =>
    Response.json({ access_token: "ya29.test", expires_in: 3600 })
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input))
    const call = {
      method: init?.method ?? "GET",
      url,
      body: String(init?.body ?? ""),
    }
    calls.push(call)
    if (url.hostname === "oauth2.googleapis.com") return tokenAnswer()
    if (url.pathname.endsWith("/messages/send")) {
      return Response.json({
        id: `sent${calls.length}`,
        threadId: "threadNew1",
      })
    }
    if (url.pathname.endsWith("/messages")) {
      return Response.json({
        messages: listed.map((id) => ({
          id,
          threadId: messages.get(id)!.threadId,
        })),
      })
    }
    const id = url.pathname.split("/").pop()!
    const message = messages.get(id)
    return message ? Response.json(message) : new Response("", { status: 404 })
  }) as typeof fetch
  return {
    fetchImpl,
    calls,
    list: (ids: string[]) => {
      listed = ids
    },
    failToken: () => {
      tokenAnswer = () =>
        Response.json({ error: "invalid_grant" }, { status: 400 })
    },
  }
}

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url")

function email(
  id: string,
  threadId: string,
  from: string,
  subject: string,
  text: string,
  { authenticated = true, headers = {} as Record<string, string> } = {},
): GmailMessage {
  const domain = from.split("@")[1]
  return {
    id,
    threadId,
    internalDate: String(Date.now()),
    payload: {
      mimeType: "text/plain",
      body: { data: b64(text) },
      headers: [
        { name: "From", value: `Sam Rivera <${from}>` },
        { name: "Subject", value: subject },
        { name: "Message-ID", value: `<${id}@mail.example.com>` },
        ...(authenticated
          ? [
              {
                name: "Authentication-Results",
                value: `mx.google.com; dmarc=pass (p=NONE) header.from=${domain}`,
              },
            ]
          : []),
        ...Object.entries(headers).map(([name, value]) => ({ name, value })),
      ],
    },
  }
}

describe.skipIf(!integrationConfigured)("Gmail sync (Google double)", () => {
  let db: TestDb
  let store: PublicStore
  const saved = {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
    key: process.env.SETTLIX_ENCRYPTION_KEY,
  }

  async function connect(merchantId: string) {
    const { error } = await db.from("gmail_connections").insert({
      merchant_id: merchantId,
      google_email: "shop@example.com",
      google_subject: "1234567890",
      scopes: [GMAIL_SCOPES.send, GMAIL_SCOPES.read],
      refresh_token_ciphertext: encryptSecret(
        "1//test-refresh",
        `gmail-refresh:${merchantId}`,
        KEY,
      ),
      connected_by: APPROVER_ID,
    })
    if (error) throw error
  }

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com"
    process.env.GOOGLE_CLIENT_SECRET = "test-secret"
    process.env.SETTLIX_ENCRYPTION_KEY = KEY.toString("base64")
    db = adminClient()
    ;({ store } = await storeFor(db, { demo: false }))
    await connect(store.id)
  })

  afterAll(() => {
    for (const [name, value] of [
      ["GOOGLE_CLIENT_ID", saved.id],
      ["GOOGLE_CLIENT_SECRET", saved.secret],
      ["SETTLIX_ENCRYPTION_KEY", saved.key],
    ] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  test("opens requests, adds replies, sorts the rest, and sends in the thread", async () => {
    const order = await createBuyerOrder(db, store.id, {
      email: "sam.rivera@example.com",
    })
    const other = await createBuyerOrder(db, store.id, {
      email: "x@example.com",
    })
    const messages = new Map<string, GmailMessage>([
      [
        "m1",
        email(
          "m1",
          "t1",
          "sam.rivera@example.com",
          `Refund for order ${order.external_order_reference}`,
          "My apron arrived torn. Can I get a refund?",
        ),
      ],
      [
        "m2",
        email(
          "m2",
          "t2",
          "stranger@example.net",
          `Refund for ${other.external_order_reference}`,
          "Refund please.",
          { authenticated: false },
        ),
      ],
      [
        "m3",
        email("m3", "t3", "noreply@shop.example", "Your return label", "Auto", {
          headers: { "Auto-Submitted": "auto-generated" },
        }),
      ],
    ])
    const google = googleDouble(messages)
    google.list(["m3", "m2", "m1"])

    const first = await syncGmail(store.id, google.fetchImpl)
    expect(first).toMatchObject({
      status: "synced",
      created: 1,
      followUps: 0,
      toSort: 1,
    })
    if (first.status !== "synced") return
    const caseId = first.newCaseIds[0]

    // Gmail was searched for refund-looking inbox mail only.
    const search = google.calls.find((call) =>
      call.url.pathname.endsWith("/messages"),
    )
    expect(search?.url.searchParams.get("q")).toMatch(
      /^in:inbox -from:me after:\d+ \{refund /,
    )

    const { data: created } = await db
      .from("cases")
      .select(
        "channel, customer_verified, gmail_thread_id, order_id, request_category, customer_email",
      )
      .eq("id", caseId)
      .single()
    expect(created).toMatchObject({
      channel: "email",
      customer_verified: true,
      gmail_thread_id: "t1",
      order_id: order.id,
      request_category: "damaged_item",
      customer_email: "sam.rivera@example.com",
    })
    const { data: sorted } = await db
      .from("inbound_emails")
      .select(
        "gmail_message_id, status, suggested_order_id, sender_authenticated",
      )
      .eq("merchant_id", store.id)
      .order("gmail_message_id")
    expect(sorted).toEqual([
      {
        gmail_message_id: "m1",
        status: "case_created",
        suggested_order_id: order.id,
        sender_authenticated: true,
      },
      {
        gmail_message_id: "m2",
        status: "to_sort",
        suggested_order_id: other.id,
        sender_authenticated: false,
      },
    ])

    // The customer replies in the thread; earlier emails aren't read again.
    messages.set(
      "m4",
      email(
        "m4",
        "t1",
        "sam.rivera@example.com",
        "Re: Refund",
        "Here is the photo.\n\nOn Tue, Shop wrote:\n> Could you send a photo?",
      ),
    )
    google.list(["m4", "m2", "m1"])
    const before = google.calls.length
    const second = await syncGmail(store.id, google.fetchImpl)
    expect(second).toMatchObject({
      status: "synced",
      created: 0,
      followUps: 1,
      toSort: 0,
    })
    const fetched = google.calls
      .slice(before)
      .map((call) => call.url.pathname.split("/").pop())
    expect(fetched).not.toContain("m1")
    expect(fetched).not.toContain("m2")
    // The access token from the first sync was reused.
    expect(
      google.calls
        .slice(before)
        .some((call) => call.url.hostname === "oauth2.googleapis.com"),
    ).toBe(false)

    const { data: withReply } = await db
      .from("cases")
      .select("customer_message")
      .eq("id", caseId)
      .single()
    expect(withReply?.customer_message).toContain("Here is the photo.")
    expect(withReply?.customer_message).not.toContain("Could you send a photo?")

    // The store answers: emailed in the same thread, replying to the latest email.
    const sent = await postStoreMessage({
      admin: db,
      merchantId: store.id,
      caseId,
      body: "Thanks, we'll refund you today.",
      author: { type: "user", id: APPROVER_ID },
      email: true,
      origin: ORIGIN,
      fetchImpl: google.fetchImpl,
    })
    expect(sent).toMatchObject({
      emailed: true,
      emailError: null,
      from: "shop@example.com",
    })
    const send = google.calls.find((call) =>
      call.url.pathname.endsWith("/messages/send"),
    )!
    const payload = JSON.parse(send.body) as { raw: string; threadId: string }
    expect(payload.threadId).toBe("t1")
    const raw = Buffer.from(payload.raw, "base64url").toString("utf8")
    expect(raw).toContain("To: sam.rivera@example.com\r\n")
    expect(raw).toContain("Subject: Re: Refund\r\n")
    expect(raw).toContain("In-Reply-To: <m4@mail.example.com>\r\n")

    const { data: connection } = await db
      .from("gmail_connections")
      .select("last_synced_at, sync_started_at, status")
      .eq("merchant_id", store.id)
      .single()
    expect(connection?.sync_started_at).toBeNull()
    expect(connection?.last_synced_at).not.toBeNull()
  })

  test("a refused refresh token asks for a reconnect", async () => {
    const { store: other } = await storeFor(db, { demo: false })
    await connect(other.id)
    const google = googleDouble(new Map())
    google.failToken()
    expect(await syncGmail(other.id, google.fetchImpl)).toMatchObject({
      status: "error",
      reconnect: true,
    })
    const { data } = await db
      .from("gmail_connections")
      .select("status, sync_started_at")
      .eq("merchant_id", other.id)
      .single()
    expect(data).toEqual({ status: "needs_reconnect", sync_started_at: null })
    expect(await syncGmail(other.id, google.fetchImpl)).toMatchObject({
      status: "error",
      reconnect: true,
    })
  })
})
