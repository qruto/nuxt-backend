import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import ts from 'typescript'

const root = process.cwd()
export const at = (file: string) => resolve(root, file)
export const read = (file: string) => readFileSync(at(file), 'utf8')

/**
 * Every file under `dir` (relative to the repo root) with one of `exts`.
 * Paths come back `/`-separated on every platform — the tests match them with
 * `/` patterns, and Node's fs accepts that spelling on Windows too.
 */
export function walk(dir: string, exts: string[], skip: (path: string) => boolean = () => false): string[] {
  const out: string[] = []
  const visit = (d: string) => {
    for (const entry of readdirSync(d)) {
      const path = join(d, entry).split(sep).join('/')
      if (skip(path)) continue
      if (statSync(path).isDirectory()) visit(path)
      else if (exts.some(ext => path.endsWith(ext))) out.push(path)
    }
  }
  visit(at(dir))
  return out
}

/**
 * The option names documented under `heading`: the first cell of every
 * markdown-table row, the `name` of every `::field{name="…"}` block, and the
 * keys of an `interface … {` code block.
 */
export function documentedKeys(markdown: string, heading: string): string[] {
  const start = markdown.indexOf(heading)
  if (start === -1) return []
  const next = markdown.indexOf('\n## ', start + heading.length)
  const section = markdown.slice(start, next === -1 ? undefined : next)
  return [...section.matchAll(/^\| `([^`]+)`|^ *:{2,}field\{name="([^"]+)"|^ {2}([a-zA-Z]+)\?: /gm)].map(m => (m[1] ?? m[2] ?? m[3])!)
}

/** Property names of an exported interface in a TypeScript file. */
export function interfaceKeys(file: string, name: string): string[] {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true)
  const keys: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      for (const member of node.members) if (ts.isPropertySignature(member) && member.name) keys.push(member.name.getText(source))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return keys
}
