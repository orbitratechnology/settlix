import { encode, renderSVG } from "uqr"

/**
 * A QR code as one SVG path: each dark run of a row becomes a rectangle, so
 * the markup stays small and scales crisply when printed. Medium error
 * correction keeps it readable on a crumpled packing slip.
 */
export function qrPath(text: string): { size: number; d: string } {
  const { data, size } = encode(text, { ecc: "M", border: 0 })
  const parts: string[] = []
  data.forEach((row, y) => {
    let x = 0
    while (x < size) {
      if (!row[x]) {
        x += 1
        continue
      }
      const start = x
      while (x < size && row[x]) x += 1
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`)
    }
  })
  return { size, d: parts.join("") }
}

/** A standalone SVG file of the QR code (white quiet zone included), for download. */
export function qrSvgFile(text: string): string {
  return renderSVG(text, { ecc: "M", border: 4, pixelSize: 10 })
}
