/** The store's name as the page's first word, so customers know who they're writing to. */
export function StoreHeader({
  storeName,
  title,
  description,
}: {
  storeName: string
  title: string
  description?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-3">
      <p className="text-base font-semibold text-muted-foreground">
        {storeName}
      </p>
      <h1 className="text-[clamp(1.875rem,5vw,2.5rem)] leading-[1.1] font-extrabold tracking-[-0.025em] text-balance">
        {title}
      </h1>
      {description ? (
        <p className="max-w-[56ch] text-lg leading-relaxed text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  )
}
