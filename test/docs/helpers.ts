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
 * The site route a content file is served at: numeric `1.` prefixes dropped
 * from every segment, `.md` dropped, `index` folded into its directory —
 * `website/content/1.getting-started/4.configuration.md` →
 * `/getting-started/configuration`.
 */
export function contentRoute(file: string): string {
  const relative = file.slice(file.indexOf('website/content/') + 'website/content/'.length)
  const segments = relative.replace(/\.md$/, '').split('/').map(s => s.replace(/^\d+\./, ''))
  if (segments.at(-1) === 'index') segments.pop()
  return `/${segments.join('/')}`
}

/**
 * The content file behind a site route, as a repo-relative path. Tests name
 * pages by route, so renumbering a page (the prefix only sets its order in
 * the sidebar) never breaks them.
 */
export function contentFile(route: string): string {
  const file = walk('website/content', ['.md']).find(f => contentRoute(f) === route)
  if (!file) throw new Error(`no page under website/content is served at ${route}`)
  return file.slice(file.indexOf('website/content/'))
}

/**
 * The YAML frontmatter of a markdown file as flat `key → value` pairs:
 * enough for SKILL.md's scalar keys, `>-` folded blocks included. Nested maps
 * keep their key with an empty value.
 */
export function frontmatter(markdown: string): Record<string, string> {
  const block = markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1]
  if (block === undefined) return {}
  const out: Record<string, string> = {}
  let key: string | undefined
  for (const line of block.split('\n')) {
    const entry = line.match(/^([\w-]+):(.*)$/)
    if (entry) {
      key = entry[1]!
      const value = entry[2]!.trim()
      out[key] = /^[>|]-?$/.test(value) ? '' : value.replace(/^(['"])(.*)\1$/, '$2')
    }
    else if (key && /^\s+\S/.test(line)) {
      out[key] = `${out[key]} ${line.trim()}`.trim()
    }
  }
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
