import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, resolve, sep } from 'node:path'
import ts from 'typescript'
import { frontmatter } from '../../scripts/lib/frontmatter.mjs'
import { DOCS_SOURCES, REFERENCE_DIR } from '../../website/shared/docs-routes'
import { isAheadOfCode } from '../../website/shared/planned'

export { frontmatter }

const root = process.cwd()

/** The generated API reference, as a repo-relative folder: not prose written by hand. */
export const GENERATED_REFERENCE = `website/content/${REFERENCE_DIR}/`
export const at = (file: string) => resolve(root, file)
export const read = (file: string) => readFileSync(at(file), 'utf8')

/**
 * Whether a docs page is ahead of the code (website/shared/planned.ts): it
 * describes a feature that is not built yet (`status: planned`), or a built
 * one's API as the release reshapes it (`status: changing`). The pins that
 * hold a page to the code skip it: the names it uses arrive with its unit,
 * which test/docs/planned-pages.test.ts holds it to until then.
 */
export const aheadOfCode = (file: string): boolean => isAheadOfCode(frontmatter(readFileSync(at(file), 'utf8')))

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
 * The module's own source as one text: `src/module.ts` and the `src/nuxt/`
 * helpers its setup calls, which between them register every auto-import,
 * component, server import and route middleware the module installs.
 */
export function readModuleSources(): string {
  return ['src/module.ts', ...walk('src/nuxt', ['.ts']), 'src/ui/registry.ts'].map(read).join('\n')
}

/**
 * The site route a content file is served at, by the collection sources in
 * website/shared/docs-routes.ts: the source's prefix plus the path below its
 * include's fixed part, numeric `1.` prefixes dropped from every segment,
 * `.md` dropped, `index` folded into its directory —
 * `website/content/docs/04.build/5.data/3.server-rendering.md` → `/docs/build/data/read-write/server-rendering`, and
 * `website/content/docs/10.reference/10.api/auth.md` → `/docs/reference/api/auth`.
 */
export function contentRoute(file: string): string {
  const relative = file.slice(file.indexOf('website/content/') + 'website/content/'.length)
  const source = DOCS_SOURCES.find(({ include, exclude = [] }) => {
    const fixed = include.slice(0, include.indexOf('*'))
    return relative.startsWith(fixed) && !exclude.some(pattern => pattern.endsWith('/**')
      ? relative.startsWith(pattern.slice(0, -2))
      : relative === pattern)
  })
  const below = source ? relative.slice(source.include.indexOf('*')) : relative
  const segments = below.replace(/\.md$/, '').split('/').map(s => s.replace(/^\d+\./, ''))
  if (segments.at(-1) === 'index') segments.pop()
  return posix.join(source?.prefix ?? '/', ...segments)
}

/** Every content file by its route, read once: the content does not change while the tests read it. */
let contentRoutes: Map<string, string> | undefined

/**
 * The content file behind a site route, as a repo-relative path. Tests name
 * pages by route, so renumbering a page (the prefix only sets its order in
 * the sidebar) never breaks them.
 */
export function contentFile(route: string): string {
  contentRoutes ??= new Map(walk('website/content', ['.md']).map(f => [contentRoute(f), f]))
  const file = contentRoutes.get(route)
  if (!file) throw new Error(`no page under website/content is served at ${route}`)
  return file.slice(file.indexOf('website/content/'))
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
