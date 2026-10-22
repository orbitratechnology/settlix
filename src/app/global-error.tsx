"use client"

/**
 * Replaces the root layout when it fails, so it brings its own document and
 * plain styles (the app's stylesheet and theme aren't loaded here).
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          colorScheme: "light dark",
        }}
      >
        <title>Something went wrong · Settlix</title>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 16px", lineHeight: 1.5 }}>
            Settlix couldn&apos;t load. If you were changing a case or a refund,
            check its current state before trying again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ padding: "8px 16px", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
