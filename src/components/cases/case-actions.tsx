"use client"

import { useActionState, useState } from "react"
import {
  AlertCircleIcon,
  ChevronDownIcon,
  CircleSlashIcon,
  FileQuestionIcon,
  MessageSquarePlusIcon,
  UserRoundSearchIcon,
} from "lucide-react"

import {
  addCaseNote,
  declineCase,
  requestEvidence,
  sendToReview,
  type CaseActionState,
} from "@/app/(app)/cases/[caseId]/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

type ActionFn = (
  caseId: string,
  previous: CaseActionState,
  formData: FormData,
) => Promise<CaseActionState>

function TextActionDialog({
  caseId,
  action,
  open,
  onOpenChange,
  title,
  description,
  label,
  hint,
  defaultText,
  submitLabel,
  destructive = false,
}: {
  caseId: string
  action: ActionFn
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  label: string
  hint?: string
  defaultText?: string
  submitLabel: string
  destructive?: boolean
}) {
  const [state, formAction, pending] = useActionState<
    CaseActionState,
    FormData
  >(async (previous, formData) => {
    const result = await action(caseId, previous, formData)
    if (result.done) onOpenChange(false)
    return result
  }, {})
  const id = `case-action-${title.replace(/\W+/g, "-").toLowerCase()}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form action={formAction} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {state.error && !pending ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={state.error ? true : undefined}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Textarea
              id={id}
              name="text"
              rows={4}
              required
              maxLength={1000}
              defaultValue={defaultText}
            />
            {hint ? <FieldDescription>{hint}</FieldDescription> : null}
            <FieldError />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type ActionKey = "note" | "requestEvidence" | "sendToReview" | "decline"

/**
 * Non-money actions on a request, in one "More actions" menu. Each opens a
 * short form and is recorded in the activity log.
 */
export function CaseActions({
  caseId,
  allowed,
  missingEvidence,
}: {
  caseId: string
  allowed: Record<ActionKey, boolean>
  /** Prefills the information request from Claude's latest check. */
  missingEvidence: string[]
}) {
  const [openAction, setOpenAction] = useState<ActionKey | null>(null)
  const dialogProps = (key: ActionKey) => ({
    caseId,
    open: openAction === key,
    onOpenChange: (open: boolean) => setOpenAction(open ? key : null),
  })
  if (!Object.values(allowed).some(Boolean)) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="lg" />}>
          More actions
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuGroup>
            {allowed.note ? (
              <DropdownMenuItem onClick={() => setOpenAction("note")}>
                <MessageSquarePlusIcon />
                Add a note
              </DropdownMenuItem>
            ) : null}
            {allowed.requestEvidence ? (
              <DropdownMenuItem
                onClick={() => setOpenAction("requestEvidence")}
              >
                <FileQuestionIcon />
                Ask the customer for more
              </DropdownMenuItem>
            ) : null}
            {allowed.sendToReview ? (
              <DropdownMenuItem onClick={() => setOpenAction("sendToReview")}>
                <UserRoundSearchIcon />
                Send for review
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          {allowed.decline ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setOpenAction("decline")}
              >
                <CircleSlashIcon />
                Decline the request
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {allowed.note ? (
        <TextActionDialog
          {...dialogProps("note")}
          action={addCaseNote}
          title="Add a note"
          description="Notes become part of the request. Check the request again afterwards so Claude takes them into account."
          label="Note"
          hint="For example: “The customer's photo arrived by email; it shows the cracked carafe.”"
          submitLabel="Add note"
        />
      ) : null}
      {allowed.requestEvidence ? (
        <TextActionDialog
          {...dialogProps("requestEvidence")}
          action={requestEvidence}
          title="Ask the customer for more"
          description="Saves what you asked for and moves the request to “Waiting on customer”. Settlix doesn't send the message: copy the drafted reply into your email or help desk."
          label="What you asked for"
          defaultText={missingEvidence.join("\n")}
          submitLabel="Save"
        />
      ) : null}
      {allowed.sendToReview ? (
        <TextActionDialog
          {...dialogProps("sendToReview")}
          action={sendToReview}
          title="Send for review"
          description="Moves the request to “Needs your review” so a person decides. No refund can be approved in the meantime."
          label="Reason"
          submitLabel="Send for review"
        />
      ) : null}
      {allowed.decline ? (
        <TextActionDialog
          {...dialogProps("decline")}
          action={declineCase}
          title="Decline this request?"
          description="Closes the request as “Not eligible” without a refund. You can reopen it later by checking it again or sending it for review."
          label="Reason"
          submitLabel="Decline request"
          destructive
        />
      ) : null}
    </>
  )
}
