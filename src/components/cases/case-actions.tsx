"use client"

import { useActionState, useState } from "react"
import {
  AlertCircleIcon,
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
  DialogTrigger,
} from "@/components/ui/dialog"
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
  trigger,
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
  trigger: React.ReactElement
  title: string
  description: string
  label: string
  hint?: string
  defaultText?: string
  submitLabel: string
  destructive?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<
    CaseActionState,
    FormData
  >(async (previous, formData) => {
    const result = await action(caseId, previous, formData)
    if (result.done) setOpen(false)
    return result
  }, {})
  const id = `case-action-${title.replace(/\W+/g, "-").toLowerCase()}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
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

/** Non-money case actions. Each one is recorded in the audit trail. */
export function CaseActions({
  caseId,
  allowed,
  missingEvidence,
}: {
  caseId: string
  allowed: {
    note: boolean
    requestEvidence: boolean
    sendToReview: boolean
    decline: boolean
  }
  /** Prefills the evidence request from the latest investigation. */
  missingEvidence: string[]
}) {
  return (
    <>
      {allowed.note ? (
        <TextActionDialog
          caseId={caseId}
          action={addCaseNote}
          trigger={
            <Button variant="outline">
              <MessageSquarePlusIcon data-icon="inline-start" />
              Add note
            </Button>
          }
          title="Add a merchant note"
          description="Notes are part of the case evidence. Re-run the investigation afterwards so the recommendation uses them."
          label="Note"
          hint="For example: “Customer's photo received in the help desk; it shows the cracked carafe.”"
          submitLabel="Add note"
        />
      ) : null}
      {allowed.requestEvidence ? (
        <TextActionDialog
          caseId={caseId}
          action={requestEvidence}
          trigger={
            <Button variant="outline">
              <FileQuestionIcon data-icon="inline-start" />
              Request evidence
            </Button>
          }
          title="Request evidence"
          description="Records what you asked the customer for and moves the case to “Needs evidence”. Settlix doesn't send the message; copy the reply draft to your help desk."
          label="Evidence requested"
          defaultText={missingEvidence.join("\n")}
          submitLabel="Record request"
        />
      ) : null}
      {allowed.sendToReview ? (
        <TextActionDialog
          caseId={caseId}
          action={sendToReview}
          trigger={
            <Button variant="outline">
              <UserRoundSearchIcon data-icon="inline-start" />
              Send to review
            </Button>
          }
          title="Send to manual review"
          description="Moves the case to “Needs review” so a merchant decides. No refund can be approved meanwhile."
          label="Reason"
          submitLabel="Send to review"
        />
      ) : null}
      {allowed.decline ? (
        <TextActionDialog
          caseId={caseId}
          action={declineCase}
          trigger={
            <Button variant="outline">
              <CircleSlashIcon data-icon="inline-start" />
              Decline
            </Button>
          }
          title="Decline this request?"
          description="Closes the case as “Not eligible” without a refund. It can be reopened by re-running the investigation or sending it to review."
          label="Reason"
          submitLabel="Decline request"
          destructive
        />
      ) : null}
    </>
  )
}
