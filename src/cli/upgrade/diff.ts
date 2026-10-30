/**
 * A unified diff of two texts, line by line, which `nuxt-backend upgrade
 * --dry-run` prints for each file it would change: the format `git diff`
 * and `patch` read, with one line of context. The lines both texts start
 * and end with are set aside, and the rest is matched by their longest
 * common subsequence, which the repairs' few, local edits keep small.
 */

interface Operation {
  kind: ' ' | '-' | '+'
  line: string
}

/** Past this many cells, the middle of two texts is shown as replaced whole rather than matched. */
const MAX_CELLS = 4_000_000

/** The lengths of the longest common subsequences of `left[i..]` and `right[j..]`, read as `at(i, j)`. */
function subsequences(left: readonly string[], right: readonly string[]): (i: number, j: number) => number {
  const width = right.length + 1
  const lengths = new Uint32Array((left.length + 1) * width)
  const at = (i: number, j: number) => lengths[i * width + j]!
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) lengths[i * width + j] = left[i] === right[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
  }
  return at
}

/** The next line of the walk at `left[i]`, `right[j]`: kept, removed (first, on a tie) or added. */
function stepAt(left: readonly string[], right: readonly string[], i: number, j: number, at: (i: number, j: number) => number): Operation['kind'] {
  if (i < left.length && j < right.length && left[i] === right[j]) return ' '
  if (j === right.length) return '-'
  if (i === left.length) return '+'
  return at(i + 1, j) >= at(i, j + 1) ? '-' : '+'
}

/** `left` → `right` walked along their longest common subsequence: kept, removed and added lines, removals first. */
function matched(left: readonly string[], right: readonly string[]): Operation[] {
  if (left.length * right.length > MAX_CELLS) return [...left.map(line => ({ kind: '-' as const, line })), ...right.map(line => ({ kind: '+' as const, line }))]
  const at = subsequences(left, right)
  const result: Operation[] = []
  let i = 0
  let j = 0
  while (i < left.length || j < right.length) {
    const kind = stepAt(left, right, i, j, at)
    result.push({ kind, line: kind === '+' ? right[j]! : left[i]! })
    if (kind !== '+') i++
    if (kind !== '-') j++
  }
  return result
}

/** `a` → `b` as kept, removed and added lines: the lines both start and end with set aside, the rest matched. */
function operations(a: readonly string[], b: readonly string[]): Operation[] {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const kept = (lines: readonly string[]) => lines.map(line => ({ kind: ' ' as const, line }))
  return [...kept(a.slice(0, head)), ...matched(a.slice(head, a.length - tail), b.slice(head, b.length - tail)), ...kept(a.slice(a.length - tail))]
}

/** `before` → `after` as a unified diff of `path`; empty when they are the same. */
export function unifiedDiff(path: string, before: string, after: string, context = 1): string {
  const normal = (text: string) => text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (normal(before) === normal(after)) return ''
  const ops = operations(normal(before).split('\n'), normal(after).split('\n'))
  // Each change with its context, merged where the context of two touches.
  const changed = ops.flatMap((op, index) => op.kind === ' ' ? [] : [index])
  const ranges: Array<[number, number]> = []
  for (const index of changed) {
    const last = ranges.at(-1)
    if (last && index - context <= last[1]) last[1] = Math.min(ops.length, index + context + 1)
    else ranges.push([Math.max(0, index - context), Math.min(ops.length, index + context + 1)])
  }
  const lines = [`--- a/${path}`, `+++ b/${path}`]
  // The line numbers each operation starts at, in the old and the new text.
  let oldLine = 1
  let newLine = 1
  const starts = ops.map((op) => {
    const at = { old: oldLine, new: newLine }
    if (op.kind !== '+') oldLine++
    if (op.kind !== '-') newLine++
    return at
  })
  for (const [start, end] of ranges) {
    const slice = ops.slice(start, end)
    const oldCount = slice.filter(op => op.kind !== '+').length
    const newCount = slice.filter(op => op.kind !== '-').length
    lines.push(`@@ -${starts[start]!.old},${oldCount} +${starts[start]!.new},${newCount} @@`, ...slice.map(op => `${op.kind}${op.line}`))
  }
  return lines.join('\n')
}
