/**
 * Generated regions inside hand-written files. A page keeps its prose and
 * marks where a lookup goes; `pnpm docs:lookups` rewrites what sits between
 * the markers and nothing else:
 *
 *   <!-- generated:env (pnpm docs:lookups, from src/env-registry.ts) -->
 *   …
 *   <!-- /generated:env -->
 *
 * A TypeScript file takes the same markers as line comments
 * (`// generated:finding-ids (…)` … `// /generated:finding-ids`).
 */

const isMarkdown = file => file.endsWith('.md')

/** The opening marker (up to its note) and the closing one, for the kind of file a region sits in. */
function markers(file, name) {
  return isMarkdown(file)
    ? { open: `<!-- generated:${name} `, openEnd: ' -->', close: `<!-- /generated:${name} -->` }
    : { open: `// generated:${name} `, openEnd: '', close: `// /generated:${name}` }
}

/** Where a region sits: the start of its opening line, the end of it, and the start of its closing marker. */
function locate(file, text, name) {
  const { open, close } = markers(file, name)
  const start = text.indexOf(open)
  if (start === -1) return undefined
  if (text.slice(start + open.length).includes(open)) throw new Error(`${file} marks the region "${name}" twice`)
  const bodyStart = text.indexOf('\n', start) + 1
  const end = text.indexOf(close, bodyStart)
  return bodyStart === 0 || end === -1 ? undefined : { start, bodyStart, end: end + close.length, closeStart: end }
}

/** The names of every region a file's text marks. */
export function regionNames(file, text) {
  const pattern = isMarkdown(file) ? /<!-- generated:([\w-]+) /g : /\/\/ generated:([\w-]+) /g
  return [...text.matchAll(pattern)].map(([, name]) => name)
}

/** What sits between a region's markers, as the lookup wrote it, or `undefined` when the file has no such region. */
export function readRegion(file, text, name) {
  const found = locate(file, text, name)
  if (!found) return undefined
  const body = text.slice(found.bodyStart, found.closeStart).replace(/\r\n/g, '\n').replace(/\n$/, '')
  return isMarkdown(file) ? body.replace(/^\n/, '').replace(/\n$/, '') : body
}

/** The text with one region's body replaced; the file must already mark the region. */
export function writeRegion(file, text, name, body, source) {
  const found = locate(file, text, name)
  if (!found) throw new Error(`${file} marks no region "${name}": add its two markers where the lookup goes`)
  const { open, openEnd, close } = markers(file, name)
  // A file with CRLF line ends keeps them.
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const inner = (isMarkdown(file) ? `\n${body}\n` : body).replace(/\n/g, eol)
  return `${text.slice(0, found.start)}${open}(pnpm docs:lookups, from ${source})${openEnd}${eol}${inner}${eol}${close}${text.slice(found.end)}`
}
