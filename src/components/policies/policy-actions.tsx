"use client"

import { useState, useTransition } from "react"
import {
  CopyPlusIcon,
  PowerIcon,
  PowerOffIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"

import {
  activatePolicy,
  createPolicyVersion,
  deactivatePolicy,
  deleteClause,
  deletePolicyDraft,
  type PolicyActionResult,
} from "@/app/(app)/policies/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** A button that asks for confirmation, then runs a server action. */
function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  action,
}: {
  trigger: React.ReactElement
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  action: () => Promise<PolicyActionResult>
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next)
        if (next) setError(null)
      }}
    >
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await action()
                if (result?.error) setError(result.error)
                else setOpen(false)
              })
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function PolicyVersionActions({
  policyId,
  label,
  isDraft,
  isActive,
}: {
  policyId: string
  /** e.g. "Standard Return Policy v3" */
  label: string
  isDraft: boolean
  isActive: boolean
}) {
  const [creating, startCreating] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (isDraft) {
    return (
      <>
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <Trash2Icon data-icon="inline-start" />
              Delete draft
            </Button>
          }
          title="Delete this draft?"
          description={`${label} and its clauses will be removed. Published versions are not affected.`}
          confirmLabel="Delete draft"
          destructive
          action={() => deletePolicyDraft(policyId)}
        />
        <ConfirmAction
          trigger={
            <Button>
              <SendIcon data-icon="inline-start" />
              Publish and activate
            </Button>
          }
          title="Publish and activate this version?"
          description={`${label} becomes the active version and can no longer be edited. The currently active version is deactivated. Existing investigations keep the version they cited.`}
          confirmLabel="Publish and activate"
          action={() => activatePolicy(policyId)}
        />
      </>
    )
  }

  return (
    <>
      {isActive ? (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <PowerOffIcon data-icon="inline-start" />
              Deactivate
            </Button>
          }
          title="Deactivate this policy?"
          description="Investigations won't use it. With no active policy, every case needs a merchant review."
          confirmLabel="Deactivate"
          action={() => deactivatePolicy(policyId)}
        />
      ) : (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <PowerIcon data-icon="inline-start" />
              Activate this version
            </Button>
          }
          title="Activate this version?"
          description={`${label} becomes the active version of this policy. Any other active version of it is deactivated.`}
          confirmLabel="Activate"
          action={() => activatePolicy(policyId)}
        />
      )}
      <Button
        disabled={creating}
        onClick={() =>
          startCreating(async () => {
            setError(null)
            const result = await createPolicyVersion(policyId)
            if (result?.error) setError(result.error)
          })
        }
      >
        {creating ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <CopyPlusIcon data-icon="inline-start" />
        )}
        New version
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  )
}

export function DeleteClauseButton({
  policyId,
  clauseId,
  clauseKey,
}: {
  policyId: string
  clauseId: string
  clauseKey: string
}) {
  return (
    <ConfirmAction
      trigger={
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Delete clause ${clauseKey}`}
        >
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
      }
      title={`Delete clause ${clauseKey}?`}
      description="This only changes the draft. Published versions keep their clauses."
      confirmLabel="Delete clause"
      destructive
      action={() => deleteClause(policyId, clauseId)}
    />
  )
}
