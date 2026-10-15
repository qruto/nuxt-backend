import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sentenceCase, styled, styledFiles } from '../../scripts/docs-style.mjs'
import { at, contentFile, contentRoute, frontmatter, GENERATED_REFERENCE, read, readModuleSources, walk } from './helpers'

// The page contract: what every docs page owes a reader whatever it covers —
// the house style, a kind, a stability chip where the surface is experimental,
// a sidebar that stays short, slugs that read as words, and only API names
// that exist.

const DOCS = 'website/content/docs'
const pages = walk(DOCS, ['.md']).map(file => file.slice(file.indexOf(DOCS)))
const handWritten = pages.filter(file => !`${file}/`.includes(GENERATED_REFERENCE))

describe('house style', () => {
  it.each(styledFiles())('%s is in sentence case (pnpm docs:style)', (file) => {
    const text = read(file)
    expect(styled(file, text), `run pnpm docs:style`).toBe(text)
    expect(text, 'a NUL byte: a placeholder the restyle never restored').not.toContain('\0')
  })

  it('restores a code span inside a quote', () => {
    expect(sentenceCase('Convex says "add `convex` to Your Dependencies"')).toBe('Convex says "add `convex` to Your Dependencies"')
    expect(sentenceCase('The `dev` Script Stops')).toBe('The `dev` script stops')
  })
})

describe('kinds', () => {
  const KINDS = ['landing', 'tutorial', 'how-to', 'concept', 'recipe', 'reference']

  it.each(pages)('%s names its kind', (file) => {
    expect(KINDS, file).toContain(frontmatter(read(file)).kind)
  })
})

/**
 * The routes that document STABILITY.md's experimental tier, by the tier
 * entry that makes them so. A page under one of them carries
 * `status: experimental` (the docs show a chip); no other page does.
 */
const EXPERIMENTAL: Record<string, string[]> = {
  '`nuxt-backend/ai`': ['/docs/ai'],
  '`nuxt-backend/mcp`': ['/docs/agents/mcp'],
  '`useSandboxInbox`': ['/docs/email/sandbox-inbox'],
}

describe('stability chips', () => {
  const stability = read('STABILITY.md')
  const tier = stability.slice(stability.indexOf('## The experimental tier'), stability.indexOf('## Deprecation'))

  it.each(Object.keys(EXPERIMENTAL))('%s is in STABILITY.md\'s experimental tier', (entry) => {
    expect(tier).toContain(entry)
  })

  it.each(handWritten)('%s carries the chip exactly when it documents the experimental tier', (file) => {
    const route = contentRoute(file)
    const experimental = Object.values(EXPERIMENTAL).flat().some(prefix => route === prefix || route.startsWith(`${prefix}/`))
    expect(frontmatter(read(file)).status === 'experimental', route).toBe(experimental)
  })
})

/** The entries of a content folder the sidebar lists: its pages and its groups. */
function entries(dir: string): string[] {
  return readdirSync(at(dir)).filter(name => !name.startsWith('.') && name !== 'index.md'
    && (name.endsWith('.md') || statSync(at(join(dir, name))).isDirectory()))
}

const folders = pages.map(file => file.slice(0, file.lastIndexOf('/')))
const uniqueFolders = [...new Set([DOCS, ...folders])].filter(dir => !`${dir}/`.includes(GENERATED_REFERENCE))

describe('the sidebar', () => {
  it.each(uniqueFolders.filter(dir => dir.split('/').length > 4))('%s, a group, lists seven entries at most', (dir) => {
    expect(entries(dir).length).toBeLessThanOrEqual(7)
  })

  it.each(uniqueFolders)('%s pads its order prefixes to one width', (dir) => {
    // Navigation sorts by the file name as a string: `10.` sorts before `2.`
    // unless every sibling is padded to the same width.
    const widths = new Set(entries(dir).map(name => name.match(/^(\d+)\./)?.[1]?.length).filter(Boolean))
    expect([...widths].length, `${dir}: ${entries(dir).join(', ')}`).toBeLessThanOrEqual(1)
  })

  it.each(pages)('%s has a dot-free route of plain words', (file) => {
    for (const segment of contentRoute(file).split('/').filter(Boolean)) expect(segment, file).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  it.each([...pages, ...walk(DOCS, ['.yml']).map(file => file.slice(file.indexOf(DOCS)))])('%s names no provider in its navigation title', (file) => {
    // Pages are named for what they do; the provider is named in prose.
    const meta = frontmatter(read(file))
    const title = file.endsWith('.yml') ? read(file).split('\n').find(line => line.startsWith('title:'))?.slice('title:'.length) ?? '' : meta.title ?? ''
    expect(title, file).not.toMatch(/\b(?:Polar|Resend|Stripe|Better Auth)\b/)
  })
})

/**
 * Names the docs may use beyond this package's own registry: Nuxt's, and the
 * Vue generic type parameters the signatures show.
 */
const NUXT_NAMES = new Set(['NuxtPage', 'NuxtLayout', 'NuxtLink', 'NuxtWelcome', 'ClientOnly', 'useNuxtApp', 'useHead', 'useRoute', 'useRouter', 'useRuntimeConfig', 'useAppConfig', 'useState', 'useFetch', 'useAsyncData', 'useCookie', 'useRequestEvent'])

/** Pages that name what no longer exists, or what an upstream package exports, on purpose. */
const NAME_EXEMPT = ['/docs/ship/migrate/upgrade', '/docs/ship/releases/changelog', '/docs/ship/releases/stability', '/docs/reference/ecosystem']

describe('API names', () => {
  // The names the module registers (src/module.ts and its src/nuxt/
  // helpers), and those the base module registers under the same Nuxt app.
  const ours = new Set([...readModuleSources().matchAll(/name: '(\w+)'/g)].map(([, name]) => name!))
  const base = new Set([...read('node_modules/nuxt-convex-module/dist/module.mjs').matchAll(/"(use[A-Z]\w*|[A-Z][A-Za-z]+)"/g)].map(([, name]) => name!))
  const known = (name: string) => ours.has(name) || base.has(name) || NUXT_NAMES.has(name)
  const commands = new Set(['init', 'dev', 'doctor', 'env', 'billing'])
  const checked = handWritten.filter(file => !NAME_EXEMPT.includes(contentRoute(file)))

  it('reads both registries', () => {
    expect(ours.has('useBilling') && ours.has('AuthForm')).toBe(true)
    expect(base.has('useQuery') && base.has('Authenticated')).toBe(true)
  })

  it.each(checked)('%s names only composables and components that exist', (file) => {
    const unknown = new Set<string>()
    for (const [, span] of read(file).matchAll(/`([^`\n]+)`/g)) {
      for (const [, name] of span!.matchAll(/\b(use[A-Z]\w*)\b/g)) if (!known(name!)) unknown.add(name!)
      const component = span!.match(/^<([A-Z]\w*)[\s/>]/)?.[1]
      if (component && !known(component)) unknown.add(component)
    }
    expect([...unknown]).toEqual([])
  })

  it.each(checked)('%s names only CLI commands that exist', (file) => {
    const unknown = new Set<string>()
    const text = read(file)
    // A command line (`npx nuxt-backend doctor`), or a code span that is one (`nuxt-backend dev`).
    const invoked = [...text.matchAll(/\b(?:npx|exec|dlx|bunx)\s+nuxt-backend(?:@[\w.-]+)?\s+([a-z][a-z-]*)/g), ...text.matchAll(/`nuxt-backend ([a-z][a-z-]*)/g)]
    for (const [, command] of invoked) if (!commands.has(command!)) unknown.add(command!)
    expect([...unknown]).toEqual([])
  })
})

/**
 * What each kind's template (the docs IA) asks of a page, reduced to a
 * marker a test can see. A page that lacks its marker is on the ratchet
 * below until it gets one; the 0.2.0 docs pass (D11) empties the list.
 */
const TEMPLATE: Record<string, { marker: string, test: (text: string) => boolean }> = {
  'landing': { marker: 'cards to the pages under it', test: text => text.includes('::card-group') },
  'tutorial': { marker: '::steps', test: text => text.includes('::steps') },
  'how-to': { marker: 'a "Related" section', test: text => /^## Related$/m.test(text) },
  'concept': { marker: 'a "What this means for you" section', test: text => /^## What this means for you$/m.test(text) },
  'recipe': { marker: '::code-tree', test: text => text.includes('::code-tree') },
  'reference': { marker: 'an example or a table', test: text => /^```|^\|.*\|$/m.test(text) },
}

describe('kind templates', () => {
  const missing = handWritten
    .filter((file) => {
      const text = read(file)
      const template = TEMPLATE[frontmatter(text).kind ?? '']
      return template && !template.test(text)
    })
    .map(file => contentRoute(file))
    .sort()

  it('names its template for every kind', () => {
    expect(Object.keys(TEMPLATE).sort()).toEqual(['concept', 'how-to', 'landing', 'recipe', 'reference', 'tutorial'])
  })

  it('only shrinks the list of pages still missing their template\'s marker', () => {
    // Remove a page from KIND_TEMPLATE_RATCHET once it has the marker.
    expect(missing).toEqual([...KIND_TEMPLATE_RATCHET].sort())
  })
})

/** Pages still owing their kind's template marker. The 0.2.0 docs pass (D11) empties it. */
const KIND_TEMPLATE_RATCHET: string[] = [
  '/docs/agents/coding',
  '/docs/agents/mcp',
  '/docs/agents/mcp/connect-a-client',
  '/docs/agents/mcp/custom-tools',
  '/docs/agents/mcp/oauth-and-consent',
  '/docs/ai/costs',
  '/docs/ai/metered-actions',
  '/docs/ai/streaming',
  '/docs/auth/access/functions',
  '/docs/auth/access/roles',
  '/docs/auth/accounts/profile',
  '/docs/auth/accounts/security',
  '/docs/auth/sign-in',
  '/docs/auth/workspaces',
  '/docs/billing/catalog',
  '/docs/billing/credits',
  '/docs/billing/credits/gifts',
  '/docs/billing/credits/spending',
  '/docs/billing/events',
  '/docs/billing/feature-gating',
  '/docs/billing/subscriptions',
  '/docs/billing/subscriptions/checkout',
  '/docs/billing/subscriptions/discounts',
  '/docs/billing/subscriptions/orders',
  '/docs/data/aggregates',
  '/docs/data/files',
  '/docs/data/jobs/migrations',
  '/docs/data/jobs/workflows',
  '/docs/data/queries-and-mutations',
  '/docs/data/search',
  '/docs/data/server-rendering',
  '/docs/email/delivery-tracking',
  '/docs/email/engagement/marketing',
  '/docs/email/engagement/sequences',
  '/docs/email/sandbox-inbox',
  '/docs/email/sending',
  '/docs/email/templates',
  '/docs/reference/backend/component',
  '/docs/ship/deploy',
  '/docs/ship/migrate/upgrade',
  '/docs/ship/production',
  '/docs/ship/production/rate-limits',
  '/docs/ship/production/security',
  '/docs/ship/production/webhooks',
  '/docs/ship/releases/changelog',
  '/docs/ship/test',
  '/docs/ship/test/linting',
  '/docs/start/concepts/how-it-works',
  '/docs/start/develop/devtools',
  '/docs/start/installation',
  '/docs/start/templates',
  '/docs/ui/customize/labels',
  '/docs/ui/customize/replace-pages',
  '/docs/ui/customize/slots',
  '/docs/ui/customize/theming',
]

// The page every test above leans on exists.
it('finds the docs', () => {
  expect(contentFile('/docs/start')).toContain('website/content/docs')
})
