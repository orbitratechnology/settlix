"use client"

import { Fragment, Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { breadcrumbs } from "@/lib/navigation"

function Crumbs() {
  const crumbs = breadcrumbs(usePathname())

  return (
    <BreadcrumbList>
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        return (
          <Fragment key={crumb.href}>
            {index > 0 ? (
              <BreadcrumbSeparator className="hidden md:block" />
            ) : null}
            <BreadcrumbItem className={isLast ? undefined : "hidden md:block"}>
              {isLast ? (
                <BreadcrumbPage className="max-w-48 truncate">
                  {crumb.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={crumb.href} />}>
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        )
      })}
    </BreadcrumbList>
  )
}

/** Breadcrumbs derived from the URL; streams in on routes with dynamic params. */
export function AppBreadcrumbs() {
  return (
    <Breadcrumb>
      <Suspense fallback={<BreadcrumbList />}>
        <Crumbs />
      </Suspense>
    </Breadcrumb>
  )
}
