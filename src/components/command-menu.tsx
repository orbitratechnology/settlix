"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { MonitorIcon, MoonIcon, SearchIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { allNavItems } from "@/lib/navigation"

/**
 * "Search or jump to…" in the top bar, also opened with ⌘K / Ctrl+K: every
 * page of the app and the colour theme, in one keyboard-first list.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { setTheme } = useTheme()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  function run(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 w-full max-w-xs min-w-0 flex-1 justify-start gap-2 bg-background px-3 font-normal text-muted-foreground shadow-none sm:w-64 sm:flex-none lg:w-80"
      >
        <SearchIcon />
        <span className="hidden sm:inline">Search or jump to…</span>
        <span className="sm:hidden">Search</span>
        <kbd className="ml-auto hidden h-6 items-center rounded-md bg-muted px-1.5 font-sans text-xs text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search or jump to"
        description="Go to a page or change the colour theme."
      >
        <Command>
          <CommandInput placeholder="Type a page or a setting…" />
          <CommandList>
            <CommandEmpty>
              Nothing matches. Try “requests” or “policy”.
            </CommandEmpty>
            <CommandGroup heading="Go to">
              {allNavItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.title}
                  onSelect={() => run(() => router.push(item.href))}
                >
                  <item.icon />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Colour theme">
              <CommandItem onSelect={() => run(() => setTheme("light"))}>
                <SunIcon />
                Light
              </CommandItem>
              <CommandItem onSelect={() => run(() => setTheme("dark"))}>
                <MoonIcon />
                Dark
              </CommandItem>
              <CommandItem onSelect={() => run(() => setTheme("system"))}>
                <MonitorIcon />
                Match my device
                <CommandShortcut>Default</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
