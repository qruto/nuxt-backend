import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from 'citty'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { main } from '../../src/cli/main'
import { FINDING_SERVICES } from '../../src/findings'
import { useCopy } from '../../website/composables/useCopy'
import { CONSOLE_DETENTS, consoleCommand, consoleTranscript, INSTALL_COMMAND, typedRows } from '../../website/shared/console'
import { SITE } from '../../website/shared/site'
import { BACKEND_CALL, namedComponents, reachableComponents, siteComponents } from './components'
import { contentFile, read, walk } from './helpers'

// The homepage says what the package does in its own words and shows its
// CLI's real output, so both are held to the code: each dial detent is what
// `doctor --only <service>` prints for a configured app, line for line; the
// install line is the Quickstart's; and the site's one description is the
// same everywhere. Nothing on it is live: it never loads the backend
// client, and its links into the playground leave the client's chunks
// alone until a reader reaches for them.

// The configured app the console shows: a dev deployment with every env var
// set but EMAIL_TEST_MODE, its routes mounted, a billing catalog of two
// plans and a provider that answers.
const DEPLOYED_ENV = ['AUTH_SECRET', 'SITE_URL', 'AUTH_TRUST_LOCAL_ORIGINS', 'EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_WEBHOOK_SECRET', 'BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET', 'BILLING_ENVIRONMENT']
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (args[0] === 'env') return { stdout: `${DEPLOYED_ENV.join('\n')}\n`, stderr: '' }
    if (args[0] === 'function-spec') return { stdout: JSON.stringify({ url: 'https://happy-otter-123.convex.cloud', functions: [] }), stderr: '' }
    if (args.includes('auth:authConfig')) return { stdout: JSON.stringify({ invitationPath: '/accept-invitation', agentLoginPath: '/login', agentConsentPath: '/oauth/consent' }), stderr: '' }
    return { stdout: '', stderr: '' }
  }),
}))
vi.mock('../../src/cli/billing', async original => ({
  ...await original<typeof import('../../src/cli/billing')>(),
  readBillingOrganizationState: async () => ({ slug: 'acme', allowMultipleSubscriptions: false, prorationBehavior: 'next_period', benefitRevocationGracePeriod: 0, preventTrialAbuse: true, portal: { updatePlan: true, pause: false }, benefitTypeByKey: {} }),
}))

describe('the console', () => {
  let app: string
  // The deployment and the provider are read through the CLI's own env: none
  // from the machine running the tests may stand in for the app's.
  const MACHINE_ENV = ['NUXT_PUBLIC_BACKEND_SITE_URL', 'NUXT_PUBLIC_CONVEX_SITE_URL', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_CONVEX_URL', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', ...DEPLOYED_ENV, 'EMAIL_TEST_MODE']

  beforeAll(() => {
    app = mkdtempSync(join(tmpdir(), 'homepage-console-'))
    mkdirSync(join(app, 'backend'))
    writeFileSync(join(app, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nBILLING_ACCESS_TOKEN=polar_oat_example\n')
    writeFileSync(join(app, 'backend/billing.catalog.ts'), 'export default { plans: { pro: { name: \'Pro\', price: { amount: 1000, interval: \'month\' } }, team: { name: \'Team\', price: { amount: 3000, interval: \'month\' } } } }\n')
  })
  afterAll(() => rmSync(app, { recursive: true, force: true }))
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  /** What `npx nuxt-backend doctor --only <service>` prints for the app, line by line. */
  async function doctor(service: string): Promise<string[]> {
    for (const name of MACHINE_ENV) vi.stubEnv(name, undefined)
    // The webhook routes answer the unsigned probe as a mounted route does.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unsigned', { status: 401 })))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runCommand(main, { rawArgs: ['doctor', '--only', service, '--cwd', app] })
    return log.mock.calls.map(call => call.join(' ')).join('\n').split('\n')
  }

  it.each(CONSOLE_DETENTS.map(detent => [detent.service, detent] as const))('%s: shows what `doctor --only` prints, every line in order, and its summary', async (service, detent) => {
    expect(FINDING_SERVICES).toContain(service)
    expect(consoleCommand(detent)).toBe(`npx nuxt-backend doctor --only ${service}`)
    expect(consoleTranscript(detent)).toEqual(await doctor(service))
  }, 30_000)

  it.each(CONSOLE_DETENTS.map(detent => [detent.service, detent] as const))('%s: links to docs that exist', (_service, detent) => {
    expect(() => contentFile(detent.docs)).not.toThrow()
  })

  it('has four detents, one per service', () => {
    expect(new Set(CONSOLE_DETENTS.map(detent => detent.service)).size).toBe(4)
  })

  // The untyped rest of every row stays in the page, invisible, so the LCD
  // has the whole transcript's size from the first character typed.
  it('types without changing what the rows hold', () => {
    const texts = ['$ npx nuxt-backend doctor --only email', '✓ Email transport: on.', '', '1 check ✓']
    const total = texts.join('').length
    for (let typed = 0; typed <= total + 4; typed += 3) {
      const rows = typedRows(texts, typed)
      expect(rows.map(row => row.shown + row.rest)).toEqual(texts)
      expect(rows.map(row => row.shown).join('').length).toBe(Math.min(typed, total))
    }
    expect(typedRows(texts, Number.POSITIVE_INFINITY).map(row => row.rest)).toEqual(['', '', '', ''])
  })
})

describe('the install line', () => {
  it('is the Quickstart\'s first command', () => {
    const quickstart = read(contentFile('/docs/start/quickstart'))
    const nuxtTab = quickstart.match(/```bash \[nuxt\]\n([^\n]+)/)?.[1]
    expect(nuxtTab).toBe(INSTALL_COMMAND)
  })

  // Clipped, it lost the package name on every phone, and most in the
  // closing plate, which leaves it less room than the hero.
  it('wraps where it does not fit, and the pill is as wide as its line', () => {
    const slot = read('website/components/home/CommandSlot.vue')
    const root = slot.match(/<template>\s*<div class="([^"]+)"/)?.[1]
    const line = slot.match(/<code class="([^"]+)"/)?.[1]
    expect(root?.split(' ')).toContain('inline-flex')
    expect(line?.split(' ')).toContain('wrap-anywhere')
    expect(line?.split(' ')).not.toContain('truncate')
    expect(line).not.toMatch(/whitespace-nowrap|text-nowrap/)
  })

  it('says how a copy went, in a status a screen reader reads once', () => {
    expect(read('website/components/home/CommandSlot.vue')).toMatch(/role="status"/)
  })

  it('copies, or says it could not, then falls quiet', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const scope = effectScope()
    try {
      const { state, copy } = scope.run(() => useCopy(1600))!
      await copy(INSTALL_COMMAND)
      expect(writeText).toHaveBeenCalledWith(INSTALL_COMMAND)
      expect(state.value).toBe('copied')
      await copy(INSTALL_COMMAND)
      expect(state.value).toBe('failed')
      vi.advanceTimersByTime(1600)
      expect(state.value).toBe('idle')
    }
    finally {
      scope.stop()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})

describe('the closing', () => {
  const closing = read('website/components/home/ClosingCta.vue')

  // The Quickstart starts the app with one command and nothing to fill in.
  it('says what the Quickstart says', () => {
    const quickstart = read(contentFile('/docs/start/quickstart'))
    expect(quickstart).toContain('npx nuxt-backend dev')
    expect(closing).toContain('nuxt-backend dev')
    expect(closing).not.toMatch(/Run convex dev|env vars/)
  })

  it('gets started where the hero does: the Quickstart', () => {
    const hero = read('website/components/home/Hero.vue')
    const go = hero.match(/<Key\s+to="([^"]+)"\s+signal="go"/)?.[1]
    expect(go).toBe('/docs/start/quickstart')
    expect(closing).toMatch(new RegExp(`<NuxtLink\\s+to="${go}"\\s+class="hbtn hbtn--primary"`))
  })
})

describe('the backend client', () => {
  const components = siteComponents()
  const chrome = [...components.keys()].filter(name => name.startsWith('App'))
  const blocks = namedComponents(read('website/content/index.md'))

  it('is never loaded by the homepage, nor by the chrome around every page', () => {
    expect(blocks).toEqual(['HomeHero', 'HomeConsole', 'HomeAgents', 'HomeClosingCta'])
    const reached = reachableComponents([...blocks, ...chrome], components)
    expect([...reached.keys()]).toContain('HomeCommandSlot')
    for (const [name, file] of reached) {
      expect(name, 'a live block').not.toMatch(/^(?:DeferredBackend|Live|Demo)/)
      expect(read(file), `${name} calls for the backend client`).not.toMatch(BACKEND_CALL)
    }
  })

  // A visible link prefetches its page's chunks, layout and middleware; the
  // playground's carry Better Auth and convex/browser. On intent (hover,
  // focus, touch) a reader who goes there loads them a moment early, and one
  // who does not never downloads them.
  it('is prefetched only on intent by the links into the playground', () => {
    const files = walk('website/components', ['.vue']).filter(file => /\/components\/(?:app|docs|home)\//.test(file))
    const links = files.flatMap(file => (read(file).match(/<(?:Key|NuxtLink|ULink)\b[^>]*>/g) ?? []).map(tag => [file, tag] as const))
    const intoPlayground = links.filter(([file, tag]) => /\sto="\/(?:playground|login)\b/.test(tag) || file.endsWith('/DocsPageKeys.vue'))
    expect(intoPlayground.length).toBeGreaterThanOrEqual(4)
    for (const [file, tag] of intoPlayground) expect(tag, file).toContain('prefetch-on="interaction"')
  })
})

describe('the site description', () => {
  it('is the one in shared/site.ts wherever it is repeated', () => {
    expect(read('website/nuxt.config.ts')).toContain('const siteDescription = SITE.description')
    expect(read('website/app.config.ts')).toContain(`'${SITE.description}'`)
    expect(JSON.parse(read('website/public/site.webmanifest')).description).toBe(SITE.description)
    expect(read('website/content/index.md')).toContain(`  description: ${SITE.description}\n`)
  })
})

describe('the homepage title', () => {
  const template = read('website/app.config.ts').match(/titleTemplate: '([^']+)'/)?.[1]

  // The hero says SITE.title; search results and tabs say SITE.seoTitle,
  // with Docus's template after it.
  it('is its own, not the hero\'s heading', () => {
    expect(read('website/content/index.md')).toContain(`  title: ${SITE.seoTitle}\n`)
    expect(read('website/components/home/Hero.vue')).toContain('SITE.title.split(\', \')')
  })

  it('reads as one title: what it does, what it runs on, the name once', () => {
    const title = template!.replace('%s', SITE.seoTitle)
    expect(title).toBe('Auth, billing, email and agents for Nuxt on Convex · Nuxt backend')
    expect(title).not.toMatch(/\.\s·/)
    expect(title.match(/backend/gi)).toHaveLength(1)
    expect(title).toContain('Convex')
  })
})
