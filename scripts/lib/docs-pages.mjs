import { readdirSync } from 'node:fs'
import { join, posix, sep } from 'node:path'

/**
 * Every Markdown file a set of Nuxt Content sources serves, under
 * `content`, with the route it answers at: the source prefix plus its path
 * below the include's fixed part, the `N.` ordering prefixes dropped and a
 * folder's `index` standing for the folder. `stem` keeps the prefixes, the
 * sidebar's order. The sources are website/shared/docs-routes.ts's
 * DOCS_SOURCES; they are passed in so plain Node can call this too.
 *
 * Read by website/modules/docs-pages.ts (the llms.txt sections) and
 * scripts/check-website-agents.mjs (sitemap.md against the content).
 */
export function docsFiles(content, sources) {
  return sources.flatMap(({ include, exclude = [], prefix }) => {
    const fixed = include.slice(0, include.indexOf('*'))
    return readdirSync(join(content, fixed), { recursive: true, encoding: 'utf8' })
      .map(file => `${fixed}${file.split(sep).join('/')}`)
      .filter(file => file.endsWith('.md') && !exclude.some(pattern => pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -2)) : file === pattern))
      .map((file) => {
        const stem = file.slice(0, -'.md'.length)
        const segments = stem.slice(fixed.length).split('/').map(segment => segment.replace(/^\d+\./, ''))
        if (segments.at(-1) === 'index') segments.pop()
        return { file, stem, route: posix.join(prefix, ...segments) }
      })
  })
}
