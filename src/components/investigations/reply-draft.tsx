"use client"

import { useId, useState } from "react"

import { CopyButton } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * Editable customer reply (FR-15) to copy elsewhere. Edits stay in the browser;
 * sending happens from the request's Messages card.
 */
export function ReplyDraft({
  initial,
  label = "Customer reply draft",
}: {
  initial: string
  label?: string
}) {
  const id = useId()
  const [text, setText] = useState(initial)

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Textarea
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        className="bg-background"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Edits aren&apos;t saved here. To send it, use Messages on the request.
        </span>
        <div className="flex gap-2">
          {text !== initial ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setText(initial)}
            >
              Reset
            </Button>
          ) : null}
          <CopyButton value={text} label="Copy reply" />
        </div>
      </div>
    </div>
  )
}
