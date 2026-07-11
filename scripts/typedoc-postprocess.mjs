// Post-process the TypeDoc markdown so it renders cleanly inside Nuxt Content /
// Docus. TypeDoc emits inter-page links relative to each file and with a `.md`
// extension (`[convex/app](convex/app.md)`). Two problems for Nuxt Content:
//   1. routes are extension-less, so `.md` links 404; and
//   2. the prerender crawler resolves *relative* links against the current URL,
//      and because the folder index route has no trailing slash, `convex/app`
//      resolves to `/api-reference/convex/app` (missing `/reference/`) → fatal
//      crawl errors.
// Fix both by rewriting every internal link to a root-absolute route, resolved
// against the file's own location. External URLs, in-page anchors, and already
// absolute links are left untouched.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, posix, sep } from 'node:path'

const ROOT = new URL(
  '../website/content/5.api-reference/9.reference/',
  import.meta.url,
).pathname

// The route the `9.reference` folder is served at (Nuxt Content strips the
// numeric `N.` prefixes: `5.api-reference/9.reference` -> `/api-reference/reference`).
const BASE_ROUTE = '/api-reference/reference'

// Any relative link target: skip external (`https://`), root-absolute (`/`),
// pure anchors (`#`), and protocol-ish (`mailto:`) links.
const LINK = /\]\((?!https?:\/\/|\/|#|mailto:)([^)]+)\)/g

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (entry.name.endsWith('.md')) yield path
  }
}

let touched = 0
for await (const file of walk(ROOT)) {
  const src = await readFile(file, 'utf8')
  // Route directory of THIS file, e.g. `convex/app.md` -> `/api-reference/reference/convex`.
  const relDir = posix.dirname(relative(ROOT, file).split(sep).join('/'))
  const linkBase = relDir === '.' ? BASE_ROUTE : posix.join(BASE_ROUTE, relDir)

  const out = src.replace(LINK, (_match, target) => {
    const hash = target.indexOf('#')
    const path = hash === -1 ? target : target.slice(0, hash)
    const anchor = hash === -1 ? '' : target.slice(hash)
    const clean = path.replace(/\.md$/, '')
    if (!clean) return `](${anchor})` // safety: anchor-only
    const abs = posix.normalize(posix.join(linkBase, clean))
    return `](${abs}${anchor})`
  })

  if (out !== src) {
    await writeFile(file, out)
    touched++
  }
}

// TypeDoc wipes the output dir on every run (`cleanOutputDir`), so the Docus
// folder-navigation file has to be (re)written here rather than committed by hand.
await writeFile(
  join(ROOT, '.navigation.yml'),
  'title: Modules\nicon: i-lucide-boxes\n',
)

// Give the generated landing page a human title/description instead of the bare
// package name TypeDoc emits as the H1.
const indexPath = join(ROOT, 'index.md')
const index = await readFile(indexPath, 'utf8')
await writeFile(
  indexPath,
  index
    .replace(/^---\nnavigation: true\n---/, [
      '---',
      'navigation: true',
      'title: Modules',
      'description: Auto-generated TypeScript API reference for every public nuxt-backend module.',
      '---',
    ].join('\n'))
    .replace(/^# nuxt-backend$/m, '# API Modules'),
)

console.log(`typedoc-postprocess: cleaned links in ${touched} file(s); wrote nav + index meta`)
