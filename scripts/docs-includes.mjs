#!/usr/bin/env node
/**
 * Docs pages that are repository files: STABILITY.md and CHANGELOG.md, each
 * rendered into the Releases group of the Ship tab so the promise and the
 * history live in one place and read the same on GitHub and on the site.
 *
 * `pnpm docs:includes` (part of `pnpm generate`) writes them;
 * test/docs/docs-includes.test.ts fails when a committed page and its source
 * have drifted apart.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'https://github.com/qruto/nuxt-backend/blob/main'
const BANNER = source => `<!-- Generated from ${source} (pnpm run docs:includes) — edit ${source} instead. -->`

export const INCLUDES = [
  {
    source: 'STABILITY.md',
    page: 'website/content/docs/09.ship/5.releases/2.stability.md',
    title: 'Stability',
    description: 'What a version number promises: the public surfaces, the experimental tier, and how upstream releases map to releases here.',
    icon: 'i-lucide-shield-check',
  },
  {
    source: 'CHANGELOG.md',
    page: 'website/content/docs/09.ship/5.releases/1.changelog.md',
    title: 'Changelog',
    description: 'Every release of nuxt-backend, newest first: what changed, what broke, and what to do about it.',
    icon: 'i-lucide-history',
  },
]

/** A repository-relative link (`./RELEASE.md`, `src/x.ts`) as a GitHub URL; site and external links unchanged. */
function absolutize(markdown) {
  return markdown.replace(/\]\((?!https?:\/\/|\/|#|mailto:)(?:\.\/)?([^)]+)\)/g, (_match, path) => `](${REPO}/${path})`)
}

/** The page a source renders to: its H1 dropped (the frontmatter title replaces it), links made absolute. */
export function render({ source, title, description, icon }) {
  const body = readFileSync(join(root, source), 'utf8').replace(/^# .*\n+/, '')
  return [
    '---',
    `title: ${title}`,
    `description: ${JSON.stringify(description)}`,
    'kind: reference',
    'navigation:',
    `  icon: ${icon}`,
    '---',
    BANNER(source),
    '',
    absolutize(body).trimEnd(),
    '',
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const include of INCLUDES) writeFileSync(join(root, include.page), render(include))
  console.log(`docs-includes: wrote ${INCLUDES.map(include => include.page).join(', ')}`)
}
