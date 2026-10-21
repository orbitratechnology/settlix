import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const sections = [
  {
    title: "Outcome",
    description:
      "Final state, approved amount, and the PayPal refund reference.",
    rows: 4,
  },
  {
    title: "Decision",
    description:
      "AI recommendation, deterministic checks, and approval record.",
    rows: 5,
  },
  {
    title: "Policy evidence",
    description: "Policy version and the exact clauses cited.",
    rows: 4,
  },
  {
    title: "Audit timeline",
    description: "Every important action, in order.",
    rows: 6,
  },
]

export function ReceiptSkeleton() {
  return (
    <div className="grid gap-4 @4xl/main:grid-cols-2">
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: section.rows }, (_, index) => (
              <Skeleton
                key={index}
                className={index % 2 ? "h-4 w-3/4" : "h-4 w-full"}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
