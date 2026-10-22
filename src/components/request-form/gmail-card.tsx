import { Suspense } from "react"
import { TriangleAlertIcon } from "lucide-react"

import { Disclosure } from "@/components/cases/case-facts"
import {
  CheckGmailButton,
  ConnectGmailForm,
  DisconnectGmailButton,
  EmailsToSortLink,
  GmailResultNotice,
} from "@/components/request-form/gmail-controls"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { integrationConfig } from "@/lib/env/server"
import { formatDateTime } from "@/lib/format"
import { getGmailConnection } from "@/lib/gmail/client"
import { can, requireMember } from "@/lib/security/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Gmail on the Request form page: connect, see what Settlix may do, check now,
 * reconnect when Google ends access, disconnect.
 */
export async function GmailCard() {
  const member = await requireMember()
  const configured = integrationConfig().gmail
  const [connection, toSort] = await Promise.all([
    getGmailConnection(createAdminClient(), member.workspace.id),
    (await createClient())
      .from("inbound_emails")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", member.workspace.id)
      .eq("status", "to_sort"),
  ])
  const canManage = can.manageStore(member.role)

  return (
    <Card id="gmail" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Gmail
          {connection?.status === "active" ? (
            <Badge variant="success">Connected</Badge>
          ) : connection ? (
            <Badge variant="warning">Needs reconnecting</Badge>
          ) : (
            <Badge variant="outline">Not connected</Badge>
          )}
          <span className="text-sm font-normal text-muted-foreground">
            Optional
          </span>
        </CardTitle>
        <CardDescription>
          For customers who email you instead of using the form, and to send
          your replies from your own address.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Suspense fallback={null}>
          <GmailResultNotice />
        </Suspense>

        {!configured ? (
          <div className="flex flex-col gap-3 text-[0.9375rem]">
            <p className="text-muted-foreground">
              Gmail isn&apos;t set up on this server yet. Until it is, use “Open
              in email app” on a request to reply from your own email.
            </p>
            <Disclosure label="Technical details">
              <p className="text-sm text-muted-foreground">
                The server needs a Google OAuth client (
                <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>
                ) and a 32-byte key for encrypting tokens (
                <code>SETTLIX_ENCRYPTION_KEY</code>). See the README.
              </p>
            </Disclosure>
          </div>
        ) : member.workspace.isDemo ? (
          <p className="text-[0.9375rem] text-muted-foreground">
            Gmail can&apos;t be connected to the shared demo store: everyone
            signed in to it would see the mailbox. In your own store, it takes
            one Google screen.
          </p>
        ) : connection ? (
          <>
            {connection.status === "needs_reconnect" ? (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>Google ended Settlix&apos;s access</AlertTitle>
                <AlertDescription>
                  Reconnect to keep emails flowing. It&apos;s the same Google
                  screen; your account is filled in.
                </AlertDescription>
              </Alert>
            ) : null}
            <dl className="grid gap-2 text-[0.9375rem]">
              <div className="flex flex-wrap justify-between gap-x-4">
                <dt className="text-muted-foreground">Account</dt>
                <dd className="font-medium break-all">{connection.email}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4">
                <dt className="text-muted-foreground">Settlix may</dt>
                <dd className="font-medium">
                  {[
                    connection.canSend ? "send your replies" : null,
                    connection.canRead ? "bring in refund emails" : null,
                  ]
                    .filter(Boolean)
                    .join(" and ")}
                </dd>
              </div>
              {connection.canRead ? (
                <div className="flex flex-wrap justify-between gap-x-4">
                  <dt className="text-muted-foreground">Last checked</dt>
                  <dd className="font-medium">
                    {connection.lastSyncedAt
                      ? formatDateTime(connection.lastSyncedAt)
                      : "Not yet"}
                  </dd>
                </div>
              ) : null}
            </dl>
            {connection.lastError && connection.status === "active" ? (
              <p className="text-sm text-destructive">{connection.lastError}</p>
            ) : null}
            <div className="flex flex-wrap items-start gap-3">
              {connection.canRead && connection.status === "active" ? (
                <CheckGmailButton />
              ) : null}
              <EmailsToSortLink count={toSort.count ?? 0} />
            </div>
            {canManage ? (
              connection.status === "needs_reconnect" ? (
                <ConnectGmailForm
                  reconnect
                  defaults={{
                    send: connection.canSend,
                    read: connection.canRead,
                  }}
                />
              ) : (
                <Disclosure label="Change permissions or disconnect">
                  <div className="flex flex-col gap-5">
                    <ConnectGmailForm
                      reconnect
                      defaults={{
                        send: connection.canSend,
                        read: connection.canRead,
                      }}
                    />
                    <DisconnectGmailButton />
                  </div>
                </Disclosure>
              )
            ) : null}
          </>
        ) : canManage ? (
          <ConnectGmailForm reconnect={false} />
        ) : (
          <p className="text-[0.9375rem] text-muted-foreground">
            An owner or admin can connect the store&apos;s Gmail.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
