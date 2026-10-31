// Sizes in `analyze`: a budget given as text (`8MB`, `350kB`), and a byte
// count printed back. Decimal throughout, as the Convex analyzer prints them:
// 1 kB is 1000 bytes.

const UNITS: Readonly<Record<string, number>> = {
  b: 1,
  kb: 1000,
  mb: 1000 ** 2,
  gb: 1000 ** 3,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
}

/**
 * A budget as bytes: a number with an optional unit (`B`, `kB`, `MB`, `GB`,
 * or the binary `KiB`, `MiB`, `GiB`), in any case; a bare number is bytes.
 * `null` for text that is none of these.
 */
export function parseSize(text: string): number | null {
  const match = /^(\d+(?:\.\d+)?) ?([a-z]*)$/i.exec(text.trim())
  if (!match) return null
  const unit = UNITS[(match[2] ?? '').toLowerCase() || 'b']
  if (unit === undefined) return null
  return Math.round(Number(match[1]) * unit)
}

/** A byte count as text: `812 B`, `350.2 kB`, `8.41 MB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000 ** 2) return `${trim(bytes / 1000)} kB`
  if (bytes < 1000 ** 3) return `${trim(bytes / 1000 ** 2)} MB`
  return `${trim(bytes / 1000 ** 3)} GB`
}

function trim(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)
}

/** `34%`, one decimal under 10%: a share of a total. */
export function formatShare(part: number, total: number): string {
  if (total <= 0) return '0%'
  const share = (part / total) * 100
  return `${share < 10 ? share.toFixed(1) : share.toFixed(0)}%`
}
