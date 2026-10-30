import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { at, read, walk } from './helpers'

// The tutorial builds Panels, and templates/panels is the finished app: the
// code a reader types is the code the template and the public demo run.
// Every fenced block the tutorial labels with a file path
// (```ts [backend/strips.ts]) is held to that file in templates/panels.
//
// The excerpt rule. A block is the file, or an excerpt of it:
// - A line that is only an elision marker (`// …` or `<!-- … -->`) splits
//   the block into chunks. Each chunk is a run of consecutive lines of the
//   file, and the chunks come in the file's order. A listing with no marker
//   is one chunk, so it skips nothing in its middle.
// - Comment-only lines (`//`, `/** … */`, ` * …`, `<!-- … -->`) and blank
//   lines are left out on both sides before comparing: the template explains
//   itself in comments the tutorial explains in prose. Everything else
//   matches to the character, indentation included.
// - `.env.local` is the one label with no file behind it: it holds secrets,
//   so no template commits it.

const TUTORIAL = 'website/content/docs/01.start/8.tutorial'
const TEMPLATE = 'templates/panels'
const UNCOMMITTED = new Set(['.env.local'])

const ELISION = /^\s*(?:\/\/ …|<!-- … -->)\s*$/
const COMMENT = /^\s*(?:\/\/|\/\*\*?|\*\/|\*(?:\s|$)|<!--[\s\S]*?-->\s*$)/

interface Block { page: string, path: string, line: number, body: string[] }

/** Every fenced block of the tutorial whose info string names a file: ```lang [path]. */
function labelledBlocks(): Block[] {
  return walk(TUTORIAL, ['.md']).flatMap((file) => {
    const page = file.slice(file.indexOf(TUTORIAL) + TUTORIAL.length + 1)
    const lines = read(file).split('\n')
    const blocks: Block[] = []
    for (let i = 0; i < lines.length; i++) {
      const open = /^```\w+ \[(.+)\]\s*$/.exec(lines[i]!)
      if (!open) continue
      const end = lines.indexOf('```', i + 1)
      blocks.push({ page, path: open[1]!, line: i + 1, body: lines.slice(i + 1, end) })
      i = end
    }
    return blocks
  })
}

/** The lines that carry code: no comment-only or blank line, trailing space trimmed. */
const code = (lines: string[]) => lines.map(line => line.trimEnd()).filter(line => line && !COMMENT.test(line))

/** A block's chunks: the code between its elision markers. */
function chunks(body: string[]): string[][] {
  const out: string[][] = [[]]
  for (const line of body) {
    if (ELISION.test(line)) out.push([])
    else out.at(-1)!.push(line)
  }
  return out.map(code).filter(chunk => chunk.length)
}

/** The first chunk of `chunks` that is not a run of `file` after the previous one, or `null` when all are. */
function firstMiss(file: string[], parts: string[][]): string[] | null {
  let from = 0
  for (const part of parts) {
    let found = -1
    for (let i = from; i + part.length <= file.length && found < 0; i++) {
      if (part.every((line, j) => file[i + j] === line)) found = i
    }
    if (found < 0) return part
    from = found + part.length
  }
  return null
}

const blocks = labelledBlocks()
const checked = blocks.filter(block => !UNCOMMITTED.has(block.path))

describe('the tutorial\'s file listings', () => {
  it('are found, in every part that writes a file', () => {
    expect(checked.length).toBeGreaterThan(20)
    expect(new Set(checked.map(block => block.page)).size).toBeGreaterThanOrEqual(6)
  })

  it.each(checked.map(block => [`${block.page}:${block.line} [${block.path}]`, block] as const))('%s is in templates/panels', (_name, block) => {
    const file = `${TEMPLATE}/${block.path}`
    expect(existsSync(at(file)), `no ${file}`).toBe(true)
    const parts = chunks(block.body)
    expect(parts.length, 'a listing with no code').toBeGreaterThan(0)
    const miss = firstMiss(code(read(file).split('\n')), parts)
    expect(miss?.join('\n') ?? null, `not a run of ${file}, in order`).toBeNull()
  })

  it('label no file but .env.local that the template does not commit', () => {
    for (const block of blocks.filter(block => UNCOMMITTED.has(block.path))) {
      expect(existsSync(at(`${TEMPLATE}/${block.path}`)), block.path).toBe(false)
    }
  })
})

describe('the excerpt rule', () => {
  const file = ['import { a } from \'a\'', '', '// why', 'export const x = a', 'export const y = 2', 'export const z = 3']

  it('takes a whole file, comments and blank lines aside', () => {
    expect(firstMiss(code(file), chunks(['import { a } from \'a\'', 'export const x = a', 'export const y = 2', 'export const z = 3']))).toBeNull()
  })

  it('takes chunks in order around an elision marker, and refuses a skip without one', () => {
    expect(firstMiss(code(file), chunks(['import { a } from \'a\'', '// …', 'export const z = 3']))).toBeNull()
    expect(firstMiss(code(file), chunks(['import { a } from \'a\'', 'export const z = 3']))).not.toBeNull()
    expect(firstMiss(code(file), chunks(['export const z = 3', '// …', 'import { a } from \'a\'']))).not.toBeNull()
  })

  it('holds indentation and every character of code', () => {
    expect(firstMiss(code(file), chunks(['  export const x = a']))).not.toBeNull()
    expect(firstMiss(code(file), chunks(['export const x = b']))).not.toBeNull()
  })
})
