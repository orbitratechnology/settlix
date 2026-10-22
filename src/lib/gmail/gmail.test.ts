import { describe, expect, mock, test } from "bun:test"

import { decryptSecret, encryptSecret, parseEncryptionKey } from "./crypto"
import { buildRawEmail, encodeHeaderText, MimeError } from "./mime"
import {
  authorizationUrl,
  exchangeCode,
  GMAIL_SCOPES,
  GoogleOAuthError,
  grantedPermissions,
  identityFromIdToken,
  newPkce,
  refreshAccessToken,
  revokeToken,
} from "./oauth"
import {
  decodeHeaderText,
  htmlToText,
  parseAddress,
  parseGmailMessage,
  stripQuotedReply,
  type GmailMessage,
} from "./parse"

const KEY = Buffer.alloc(32, 7)

describe("token encryption", () => {
  test("round-trips and binds the ciphertext to its context", () => {
    const sealed = encryptSecret("1//refresh-token", "gmail-refresh:m1", KEY)
    expect(sealed).toStartWith("v1.")
    expect(sealed).not.toContain("refresh-token")
    expect(decryptSecret(sealed, "gmail-refresh:m1", KEY)).toBe(
      "1//refresh-token",
    )
    expect(() => decryptSecret(sealed, "gmail-refresh:m2", KEY)).toThrow()
    expect(() =>
      decryptSecret(sealed, "gmail-refresh:m1", Buffer.alloc(32, 8)),
    ).toThrow()
  })

  test("accepts only 32-byte base64 keys", () => {
    expect(parseEncryptionKey(KEY.toString("base64"))?.equals(KEY)).toBe(true)
    expect(parseEncryptionKey(KEY.toString("base64url"))?.equals(KEY)).toBe(
      true,
    )
    expect(parseEncryptionKey("short")).toBeNull()
    expect(parseEncryptionKey(undefined)).toBeNull()
  })
})

describe("Google OAuth", () => {
  const client = {
    clientId: "client-123.apps.googleusercontent.com",
    clientSecret: "secret",
    redirectUri: "https://settlix.example/api/integrations/gmail/callback",
  }

  test("the consent URL asks only for what was chosen, with PKCE", () => {
    const { challenge, verifier } = newPkce()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const url = new URL(
      authorizationUrl({
        client,
        permissions: ["send"],
        state: "state-1",
        codeChallenge: challenge,
        loginHint: "shop@example.com",
      }),
    )
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    )
    const params = Object.fromEntries(url.searchParams)
    expect(params).toMatchObject({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state: "state-1",
      code_challenge: challenge,
      code_challenge_method: "S256",
      login_hint: "shop@example.com",
    })
    expect(params.scope).toBe(`openid email ${GMAIL_SCOPES.send}`)
  })

  test("granted scopes decide the features (granular consent)", () => {
    expect(
      grantedPermissions(`openid ${GMAIL_SCOPES.send} email`),
    ).toMatchObject({ send: true, read: false })
    expect(grantedPermissions(undefined)).toMatchObject({
      send: false,
      read: false,
    })
  })

  test("exchanges the code with the verifier and reports Google's errors", async () => {
    const fetchMock = mock(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = new URLSearchParams(String(init?.body))
        expect(body.get("code_verifier")).toBe("verifier")
        expect(body.get("grant_type")).toBe("authorization_code")
        return Response.json({
          access_token: "ya29.a",
          expires_in: 3599,
          refresh_token: "1//r",
          scope: GMAIL_SCOPES.send,
          id_token: "x.y.z",
        })
      },
    )
    const tokens = await exchangeCode(
      { client, code: "code", codeVerifier: "verifier" },
      fetchMock as unknown as typeof fetch,
    )
    expect(tokens).toMatchObject({
      accessToken: "ya29.a",
      refreshToken: "1//r",
    })

    const revoked = mock(async () =>
      Response.json(
        {
          error: "invalid_grant",
          error_description: "Token has been expired or revoked.",
        },
        { status: 400 },
      ),
    )
    const error = await refreshAccessToken(
      { client, refreshToken: "1//r" },
      revoked as unknown as typeof fetch,
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GoogleOAuthError)
    expect((error as GoogleOAuthError).needsReconnect).toBe(true)
  })

  test("revoking an already invalid token counts as done", async () => {
    const fetch400 = mock(async () => new Response("", { status: 400 }))
    expect(await revokeToken("t", fetch400 as unknown as typeof fetch)).toBe(
      true,
    )
    const offline = mock(async () => {
      throw new Error("down")
    })
    expect(await revokeToken("t", offline as unknown as typeof fetch)).toBe(
      false,
    )
  })

  test("reads the verified email from the ID token and rejects others", () => {
    const token = (claims: Record<string, unknown>) =>
      `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`
    const valid = {
      iss: "https://accounts.google.com",
      aud: client.clientId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: "1234",
      email: "Shop@Example.com",
      email_verified: true,
    }
    expect(identityFromIdToken(token(valid), client.clientId)).toEqual({
      sub: "1234",
      email: "shop@example.com",
    })
    for (const bad of [
      { ...valid, aud: "other" },
      { ...valid, iss: "https://evil.example" },
      { ...valid, exp: 1 },
      { ...valid, email_verified: false },
    ]) {
      expect(() => identityFromIdToken(token(bad), client.clientId)).toThrow(
        GoogleOAuthError,
      )
    }
    expect(() => identityFromIdToken(null, client.clientId)).toThrow()
  })
})

describe("outgoing email", () => {
  const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8")

  test("builds a threaded plain-text reply", () => {
    const raw = decode(
      buildRawEmail({
        to: "maya.chen@example.com",
        subject: "Re: Your refund request STX-1100",
        body: "Hi Maya,\nRefunded.",
        inReplyTo: "<abc@mail.gmail.com>",
        references: ["<root@mail.gmail.com>"],
      }),
    )
    expect(raw).toContain("To: maya.chen@example.com\r\n")
    expect(raw).toContain("In-Reply-To: <abc@mail.gmail.com>\r\n")
    expect(raw).toContain(
      "References: <root@mail.gmail.com> <abc@mail.gmail.com>\r\n",
    )
    const [, body] = raw.split("\r\n\r\n")
    expect(Buffer.from(body, "base64").toString("utf8")).toBe(
      "Hi Maya,\r\nRefunded.",
    )
  })

  test("refuses header injection and encodes non-ASCII subjects", () => {
    expect(() =>
      buildRawEmail({
        to: "a@b.co\r\nBcc: x@y.co",
        subject: "x",
        body: "y",
      }),
    ).toThrow(MimeError)
    expect(() =>
      buildRawEmail({
        to: "a@b.co",
        subject: "x",
        body: "y",
        inReplyTo: "bad",
      }),
    ).toThrow(MimeError)
    const raw = decode(
      buildRawEmail({
        to: "a@b.co",
        subject: "Line\r\nBcc: x@y.co",
        body: "y",
      }),
    )
    expect(raw).not.toContain("\r\nBcc:")
    expect(encodeHeaderText("Rückerstattung")).toBe(
      `=?UTF-8?B?${Buffer.from("Rückerstattung").toString("base64")}?=`,
    )
  })
})

describe("incoming email", () => {
  const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url")

  function message(
    headers: Record<string, string>,
    parts: GmailMessage["payload"],
  ): GmailMessage {
    return {
      id: "18c1",
      threadId: "18c0",
      internalDate: String(Date.UTC(2026, 9, 22, 9, 0)),
      payload: {
        ...parts,
        headers: [
          ...Object.entries(headers).map(([name, value]) => ({ name, value })),
          ...(parts?.headers ?? []),
        ],
      },
    }
  }

  test("parses addresses and encoded words", () => {
    expect(parseAddress('"Maya Chen" <Maya.Chen@Example.com>')).toEqual({
      email: "maya.chen@example.com",
      name: "Maya Chen",
    })
    expect(parseAddress("sam@example.com")).toEqual({
      email: "sam@example.com",
      name: null,
    })
    expect(parseAddress("no address")).toBeNull()
    expect(decodeHeaderText("=?UTF-8?B?QW7DoQ==?= Souza")).toBe("Aná Souza")
    expect(decodeHeaderText("=?utf-8?Q?Caf=C3=A9_order?=")).toBe("Café order")
  })

  test("keeps only the new text of a reply", () => {
    expect(
      stripQuotedReply(
        "Here is the photo.\n\nOn Tue, Oct 21, 2026 at 9:00 AM Shop <shop@example.com> wrote:\n> Could you send a photo?",
      ),
    ).toBe("Here is the photo.")
    expect(stripQuotedReply("Thanks\n-- \nSam\nSent from my phone")).toBe(
      "Thanks",
    )
    expect(
      htmlToText("<p>Hi&nbsp;there</p><p>It&#39;s broken<br>sorry</p>"),
    ).toBe("Hi there\nIt's broken\nsorry")
  })

  test("reads a multipart message with an attachment", () => {
    const parsed = parseGmailMessage(
      message(
        {
          From: "Sam Rivera <sam.rivera@example.com>",
          Subject: "Refund for order HP-10452",
          "Message-ID": "<m1@mail.example.com>",
          "Authentication-Results":
            "mx.google.com; dkim=pass header.i=@example.com header.s=s1; spf=pass (google.com: domain of sam.rivera@example.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=sam.rivera@example.com; dmarc=pass (p=NONE) header.from=example.com",
        },
        {
          mimeType: "multipart/mixed",
          parts: [
            {
              mimeType: "multipart/alternative",
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: b64("The apron tore on first wear.\r\n") },
                },
                {
                  mimeType: "text/html",
                  body: { data: b64("<p>ignored</p>") },
                },
              ],
            },
            {
              mimeType: "image/jpeg",
              filename: "tear.jpg",
              body: { attachmentId: "att1", size: 1000 },
            },
          ],
        },
      ),
    )
    expect(parsed).toMatchObject({
      fromEmail: "sam.rivera@example.com",
      fromName: "Sam Rivera",
      subject: "Refund for order HP-10452",
      rfcMessageId: "<m1@mail.example.com>",
      attachments: ["tear.jpg"],
      authenticated: true,
      automated: false,
      receivedAt: "2026-10-22T09:00:00.000Z",
    })
    expect(parsed?.text).toStartWith("The apron tore on first wear.")
    expect(parsed?.text).toContain("attached a file (tear.jpg)")
  })

  test("sender authentication trusts only Gmail's topmost, aligned result", () => {
    const html = { mimeType: "text/html", body: { data: b64("<p>hi</p>") } }
    const auth = (results: string[], from = "sam@example.com") =>
      parseGmailMessage({
        ...message({ From: from }, html),
        payload: {
          ...html,
          headers: [
            { name: "From", value: from },
            ...results.map((value) => ({
              name: "Authentication-Results",
              value,
            })),
          ],
        },
      })?.authenticated

    expect(
      auth(["mx.google.com; spf=pass smtp.mailfrom=bounce@example.com"]),
    ).toBe(true)
    expect(auth(["mx.google.com; dkim=pass header.i=@mail.example.com"])).toBe(
      false,
    )
    expect(auth(["mx.google.com; dkim=pass header.d=example.com"])).toBe(true)
    expect(auth(["mx.google.com; dmarc=fail header.from=example.com"])).toBe(
      false,
    )
    expect(
      auth(["mx.google.com; spf=pass smtp.mailfrom=x@other.example"]),
    ).toBe(false)
    // A forged result below Gmail's own doesn't count.
    expect(
      auth([
        "mx.google.com; spf=fail smtp.mailfrom=sam@example.com",
        "mx.google.com; dmarc=pass header.from=example.com",
      ]),
    ).toBe(false)
    expect(auth([])).toBe(false)
  })

  test("flags automated mail", () => {
    const parsed = parseGmailMessage(
      message(
        { From: "noreply@shop.example", "Auto-Submitted": "auto-replied" },
        { mimeType: "text/plain", body: { data: b64("Out of office") } },
      ),
    )
    expect(parsed?.automated).toBe(true)
  })
})
