/**
 * Source files edited in place, the way `doctor --fix` (src/convex-config.ts)
 * edits them: parsed with
 * magicast, changed at the parsed positions, and written back with
 * everything else kept byte for byte — a BOM and every line end included —
 * through a temporary file.
 */
import { closeSync, fchmodSync, fstatSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The slice of a Babel AST node the edits read. */
export interface Node {
  type: string
  [key: string]: unknown
}

export type Magicast = typeof import('magicast')

/**
 * A file's text, or `undefined` when there is no file: one read rather than
 * a check and then a read, which another process could fall between.
 */
export function readTextIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * A file's text: `raw` as it is (its BOM aside), and `code`, the same with
 * LF line ends, which the parser's offsets count in. An edit is planned on
 * `code` and applied to `raw` (`toRaw` maps an offset across), so every
 * line end the file has, CRLF, LF or a mix, is kept byte for byte.
 */
export interface SourceText {
  raw: string
  code: string
  bom: boolean
  /** The line end inserted lines get: the one most of the file's lines end with. */
  eol: string
  toRaw: (offset: number) => number
}

/** A text and its line ends, as {@link SourceText} describes them. */
export function sourceText(text: string): SourceText {
  const bom = text.startsWith('\uFEFF')
  const raw = bom ? text.slice(1) : text
  // The LF-text offsets of the line breaks that are CRLF in the file.
  const crlf: number[] = []
  let removed = 0
  for (let at = raw.indexOf('\r\n'); at >= 0; at = raw.indexOf('\r\n', at + 2)) crlf.push(at - removed++)
  const lf = raw.split('\n').length - 1
  const toRaw = (offset: number) => {
    let before = 0
    while (before < crlf.length && crlf[before]! < offset) before++
    return offset + before
  }
  return { raw, code: raw.replace(/\r\n/g, '\n'), bom, eol: crlf.length * 2 > lf ? '\r\n' : '\n', toRaw }
}

/** Read a file and its line ends. */
export function readSource(path: string): SourceText {
  return sourceText(readFileSync(path, 'utf-8'))
}

/** Wait `ms` without yielding: the fix runs synchronously. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Write `code` back with the file's BOM, through a temporary file beside
 * the real one (symlinks resolved) that takes its mode and is renamed over
 * it. On Windows a rename can meet a file another process holds: it is
 * tried again a few times, then refused with the file named. Never written
 * in place, which would be a path checked and then used. The temporary
 * file never outlives a failure.
 */
export function writeSource(path: string, source: SourceText, code: string): void {
  const target = realpathSync(path)
  const text = `${source.bom ? '\uFEFF' : ''}${code}`
  const temporary = join(dirname(target), `.${process.pid}-${Date.now()}.nuxt-backend.tmp`)
  // The mode read from the open file, and the temporary file created new
  // (`wx`) and written through its own descriptor: no path is checked and
  // then used.
  const opened = openSync(target, 'r')
  const mode = fstatSync(opened).mode
  closeSync(opened)
  try {
    const written = openSync(temporary, 'wx')
    try {
      writeSync(written, text)
      fchmodSync(written, mode)
    }
    finally {
      closeSync(written)
    }
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(temporary, target)
        return
      }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? ''
        if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(code)) throw error
        if (attempt === 4) throw new Error(`${target} is held by another program (${code}). Close it there and run this again.`, { cause: error })
        pause(50 * 2 ** attempt)
      }
    }
  }
  finally {
    rmSync(temporary, { force: true })
  }
}

/** The program `code` parses to, or the parser's message. */
export function parse(magicast: Magicast, code: string): Node | string {
  try {
    return magicast.parseModule(code).$ast as unknown as Node
  }
  catch (error) {
    return (error instanceof Error ? error.message : String(error)).split('\n')[0]!
  }
}

/** Call `visit` on every node under `node`, depth first, with the node it hangs from. */
export function walk(node: unknown, visit: (node: Node, parent: Node | undefined) => void, parent?: Node): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent)
    return
  }
  const candidate = node as Node
  const isNode = typeof candidate.type === 'string'
  if (isNode) visit(candidate, parent)
  for (const [key, value] of Object.entries(candidate)) {
    if (key !== 'loc' && key !== 'comments' && !key.endsWith('Comments')) walk(value, visit, isNode ? candidate : parent)
  }
}

/** A property's key name, for plain and shorthand properties. */
export function keyOf(property: Node): string | undefined {
  const key = property.key as Node | undefined
  if (!key) return undefined
  return key.type === 'Identifier' ? key.name as string : key.type === 'StringLiteral' ? key.value as string : undefined
}

/** A replacement of `code`'s `[start, end)` with `text`; an insertion when the two are equal. */
export interface Edit {
  start: number
  end: number
  text: string
}

/**
 * Apply edits to the original text. Offsets are `code`'s, mapped onto the
 * raw text, so the file's own line ends stay. Edits must not overlap;
 * several insertions at one offset land in the order they were made.
 */
export function applyEdits(source: SourceText, edits: readonly Edit[]): string {
  const ordered = edits.map((edit, order) => ({ ...edit, order }))
    .sort((left, right) => right.start - left.start || right.end - left.end || right.order - left.order)
  return ordered.reduce((result, { start, end, text }) => {
    return result.slice(0, source.toRaw(start)) + text.replace(/\n/g, source.eol) + result.slice(source.toRaw(end))
  }, source.raw)
}
