// Post-process the release section changelogen just wrote so scoped commits sit
// under their own `#### Scope` sub-list instead of a `**scope:**` prefix on
// every line. changelogen has no grouping option, and its markdown is regular
// enough that regrouping it afterwards is safer than replacing its generator.
//
// Per `### Type` section: unscoped commits stay in the main list, then one
// `#### Scope` list per scope, scopes in alphabetical order. Only the newest
// `## vX.Y.Z` section is touched — older ones were grouped when they were
// released, and their scope sub-lists would otherwise read as unscoped items.
// Anything after a section's list (changelogen's `#### ⚠️ Breaking Changes`
// block) is kept verbatim.
import { readFile, writeFile } from 'node:fs/promises'

const FILE = new URL('../CHANGELOG.md', import.meta.url)

// Display names for scopes (`ci` → `CI`); anything unmapped is capitalised.
const { changelog } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const scopeMap = changelog?.scopeMap ?? {}

// changelogen's line: `- **scope:** Description ([sha](url))`
const SCOPED = /^- \*\*(.+?):\*\* (.*)$/

/** Heading for a scope: its `changelog.scopeMap` name, else the key capitalised. */
function scopeName(scope) {
  return scopeMap[scope] ?? scope.charAt(0).toUpperCase() + scope.slice(1)
}

/** One `### Type` block: unscoped items first, then a `#### Scope` list per scope. */
function groupSection(lines) {
  // lines[0] is the `### Type` heading; the list follows after blank lines.
  let i = 1
  while (i < lines.length && lines[i] === '') i++
  const start = i
  while (i < lines.length && lines[i].startsWith('- ')) i++
  const list = lines.slice(start, i)
  const tail = lines.slice(i)

  const plain = []
  const scoped = new Map()
  for (const line of list) {
    const m = line.match(SCOPED)
    if (!m) {
      plain.push(line)
      continue
    }
    const [, scope, rest] = m
    if (!scoped.has(scope)) scoped.set(scope, [])
    scoped.get(scope).push(`- ${rest}`)
  }
  if (scoped.size === 0) return lines

  const out = [lines[0], '']
  if (plain.length > 0) out.push(...plain, '')
  for (const scope of [...scoped.keys()].sort()) {
    out.push(`#### ${scopeName(scope)}`, '', ...scoped.get(scope), '')
  }
  // Drop the trailing blank; the section separator is restored on join.
  out.pop()
  return [...out, ...tail]
}

const source = await readFile(FILE, 'utf8')
const lines = source.split('\n')

const first = lines.findIndex(l => l.startsWith('## '))
if (first === -1) process.exit(0)
let end = lines.findIndex((l, n) => n > first && l.startsWith('## '))
if (end === -1) end = lines.length

// Split the release section into its `### Type` blocks, keeping the preamble
// (the `## version` heading and the compare link) as the first block.
const blocks = []
for (const line of lines.slice(first, end)) {
  if (line.startsWith('### ') || blocks.length === 0) blocks.push([])
  blocks.at(-1).push(line)
}
const grouped = blocks.flatMap((block, n) => (n === 0 ? block : groupSection(block)))

const output = [...lines.slice(0, first), ...grouped, ...lines.slice(end)].join('\n')
if (output !== source) await writeFile(FILE, output)
