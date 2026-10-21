import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function SkeletonLines({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          className={index % 3 === 2 ? "h-4 w-2/3" : "h-4 w-full"}
        />
      ))}
    </div>
  )
}

/**
 * Investigation workspace layout: facts | AI investigation | checks & action.
 * Stacks on phones, puts facts and checks side by side on tablets with the
 * investigation below, and uses three columns on wide screens.
 */
export function CaseWorkspaceSkeleton() {
  return (
    <div className="grid gap-4 @2xl/main:grid-cols-2 @5xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Request &amp; order facts</CardTitle>
          <CardDescription>
            Customer message, mapped order, and captured payment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SkeletonLines rows={6} />
        </CardContent>
      </Card>

      <Card className="@2xl/main:order-last @2xl/main:col-span-2 @5xl/main:order-none @5xl/main:col-span-1">
        <CardHeader>
          <CardTitle>AI investigation</CardTitle>
          <CardDescription>
            Summary, cited policy clauses, evidence, and the proposed
            resolution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SkeletonLines rows={9} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checks &amp; action</CardTitle>
          <CardDescription>
            Deterministic eligibility, refundable balance, and approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SkeletonLines rows={6} />
        </CardContent>
      </Card>
    </div>
  )
}
