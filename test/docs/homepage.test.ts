import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from 'citty'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { main } from '../../src/cli/main'
import { CAPABILITY_NAMES } from '../../src/capabilities'
import { useCopy } from '../../website/composables/useCopy'
import * as shared from '../../website/shared/console'
import { APP_CAPABILITY_IDS } from '../../website/shared/docs-capabilities'
import { HOME_MODULES, HOME_SERVICES, HOME_TRAITS } from '../../website/shared/home'
import { CONSOLE_DETENTS, CONSOLE_PHONE_ROWS, consoleCommand, consoleTranscript, foldsOnPhone, INSTALL_COMMAND, typedRows, type ConsoleDetent } from '../../website/shared/console'
import { SITE } from '../../website/shared/site'
import { BACKEND_CALL, namedComponents, reachableComponents, siteComponents } from './components'
import { contentFile, read, walk } from './helpers'
import { component, homeConsole, lcdRowCount, parts, renderComponent } from './sfc'

// The homepage says what the package does in its own words and shows its
// CLI's real output, so both are held to the code: each dial detent is what
// `doctor --only <layer>` prints for a configured app, line for line; the
// install line is the Quickstart's; and the site's one description is the
// same everywhere. Nothing on it is live: it never loads the backend
// client, and its links into the playground leave the client's chunks
// alone until a reader reaches for them.

// The configured app the console shows: a dev deployment with every env var
// set, its routes mounted, a billing catalog of two
// plans and a provider that answers.
const DEPLOYED_ENV = ['AUTH_SECRET', 'SITE_URL', 'BACKEND_ENVIRONMENT', 'EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_WEBHOOK_SECRET', 'BILLING_ACCESS_TOKEN', 'BILLING_WEBHOOK_SECRET']
vi.mock('../../src/convex-cli', () => ({
  runConvex: vi.fn(async (_rootDir: string, args: string[]) => {
    if (args[0] === 'env') return { stdout: `${DEPLOYED_ENV.join('\n')}\n`, stderr: '' }
    if (args[0] === 'function-spec') return { stdout: JSON.stringify({ url: 'https://happy-otter-123.convex.cloud', functions: [] }), stderr: '' }
    if (args.includes('auth:authConfig')) return { stdout: JSON.stringify({ paths: { authRoute: '/api/auth', acceptInvitation: '/accept-invitation', keepAccount: '/account/keep', security: '/security', waitlist: '/waitlist' } }), stderr: '' }
    return { stdout: '', stderr: '' }
  }),
}))
vi.mock('../../src/cli/billing', async original => ({
  ...await original<typeof import('../../src/cli/billing')>(),
  readBillingOrganizationState: async () => ({ slug: 'acme', allowMultipleSubscriptions: false, prorationBehavior: 'next_period', benefitRevocationGracePeriod: 0, preventTrialAbuse: true, portal: { updatePlan: true, pause: false }, benefitTypeByKey: {}, memberModel: true, membersReadable: true, customerEmailsOff: [] }),
}))

describe('the console', () => {
  let app: string
  // The deployment and the provider are read through the CLI's own env: none
  // from the machine running the tests may stand in for the app's.
  const MACHINE_ENV = ['NUXT_PUBLIC_CONVEX_SITE_URL', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_CONVEX_URL', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', ...DEPLOYED_ENV]

  beforeAll(() => {
    app = mkdtempSync(join(tmpdir(), 'homepage-console-'))
    mkdirSync(join(app, 'backend'))
    writeFileSync(join(app, '.env.local'), 'CONVEX_DEPLOYMENT=dev:happy-otter-123\nBILLING_ACCESS_TOKEN=polar_oat_example\n')
    writeFileSync(join(app, 'backend/billing.catalog.ts'), 'export default { plans: { pro: { name: \'Pro\', prices: { month: 1000 } }, team: { name: \'Team\', prices: { month: 3000 } } } }\n')
  })
  afterAll(() => rmSync(app, { recursive: true, force: true }))
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  /** What `npx nuxt-backend doctor --only <layer>` prints for the app, line by line. */
  async function doctor(layer: string): Promise<string[]> {
    for (const name of MACHINE_ENV) vi.stubEnv(name, undefined)
    // The webhook routes answer the unsigned probe as a mounted route does.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unsigned', { status: 401 })))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runCommand(main, { rawArgs: ['doctor', '--only', layer, '--cwd', app] })
    return log.mock.calls.map(call => call.join(' ')).join('\n').split('\n')
  }

  it.each(CONSOLE_DETENTS.map(detent => [detent.layer, detent] as const))('%s: shows what `doctor --only` prints, every line in order, and its summary', async (layer, detent) => {
    expect(CAPABILITY_NAMES).toContain(layer)
    expect(consoleCommand(detent)).toBe(`npx nuxt-backend doctor --only ${layer}`)
    expect(consoleTranscript(detent)).toEqual(await doctor(layer))
  }, 30_000)

  it.each(CONSOLE_DETENTS.map(detent => [detent.layer, detent] as const))('%s: links to docs that exist', (_layer, detent) => {
    expect(() => contentFile(detent.docs)).not.toThrow()
  })

  it('has a detent for each layer a configured app checks clean', () => {
    expect(CONSOLE_DETENTS.map(detent => detent.layer)).toEqual(['auth', 'billing', 'email', 'ai', 'protection', 'monitoring'])
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

const detent = (layer: string) => CONSOLE_DETENTS.find(entry => entry.layer === layer)!

/** Server-rendered markup without the fragment comments Vue marks it with. */
const markup = (html: string) => html.split('<!--[-->').join('').split('<!--]-->').join('')

/** The home console rendered with `layer` on the dial, from the page's detents or `from`. */
async function renderConsole(layer: string, from?: readonly ConsoleDetent[]): Promise<string> {
  const { root, components } = homeConsole(layer, from)
  return markup(await renderComponent(root, {}, components))
}

/** The command line the hero, the agents section and the closing mill in. */
const commandSlot = () => component('website/components/home/CommandSlot.vue', { '~~/shared/console': shared }, { useCopy })

/** A row's text: its markup with every tag stripped, until none is left. */
function textOf(html: string): string {
  let text = html
  for (let previous = ''; previous !== text;) {
    previous = text
    text = text.replace(/<[^>]*>/g, '')
  }
  return text
}

/** The rows the LCD draws, in order: each one's classes and text. */
function lcdRows(html: string): Array<{ classes: string[], text: string }> {
  return [...html.matchAll(/<div class="(lcd-row[^"]*)"[^>]*>([\s\S]*?)<\/div>/g)]
    .map(([, classes, inner]) => ({ classes: classes!.split(' '), text: textOf(inner!) }))
}

// A phone shows a long transcript folded to its first six rows and the
// summary, with a key that shows the rest; from `sm` up nothing folds, and
// a screen reader always gets the whole of it.
describe('the console on a phone', () => {
  it('folds every row past the first six but the summary, and nothing that fits', () => {
    expect(CONSOLE_PHONE_ROWS).toBe(6)
    for (const entry of CONSOLE_DETENTS) {
      const count = lcdRowCount(entry.layer)
      const folded = Array.from({ length: count }, (_, index) => index).filter(index => foldsOnPhone(index, count))
      const expected = count > 7 ? Array.from({ length: count - 7 }, (_, index) => index + 6) : []
      expect(folded, entry.layer).toEqual(expected)
    }
    expect(CONSOLE_DETENTS.filter(entry => lcdRowCount(entry.layer) > 7).map(entry => entry.layer)).toEqual(['billing', 'email'])
  })

  it('draws a long transcript folded below sm only, with the fold marked above the summary', async () => {
    const rows = lcdRows(await renderConsole('billing'))
    const drawn = rows.filter(row => !row.classes.includes('sm:hidden'))
    expect(drawn).toHaveLength(lcdRowCount('billing'))
    expect(drawn.map(row => row.classes.includes('max-sm:hidden'))).toEqual(drawn.map((_, index) => index >= 6 && index < drawn.length - 1))
    // Every fold is a phone variant, so a wider screen draws what it did.
    expect(rows.flatMap(row => row.classes).filter(name => /hidden/.test(name) && !/^(?:max-sm:|sm:)hidden$/.test(name))).toEqual([])
    const mark = rows.findIndex(row => row.classes.includes('sm:hidden'))
    expect(mark).toBe(rows.length - 2)
    expect(rows[mark]!.text.trim()).toBe('…')
  })

  it('puts a key under the glass that says how many lines there are and controls the LCD', async () => {
    const html = await renderConsole('billing')
    // The key's label, without the comments a server render leaves around a slot.
    const key = html.match(/<button[^>]*aria-controls="([^"]+)"[^>]*>((?:<!--[^>]*-->|[^<])*)<\/button>/)
    expect(key?.[2]!.replace(/<!--[^>]*-->/g, '').trim()).toBe(`Show all ${lcdRowCount('billing')} lines`)
    expect(key?.[0]).toContain('aria-pressed="false"')
    expect(key?.[0]).toMatch(/class="[^"]*\bsm:hidden\b/)
    const lcd = html.match(new RegExp(`<div[^>]*\\bid="${key![1]}"[^>]*>`))?.[0]
    expect(lcd).toContain('aria-label="Doctor output"')
  })

  it('reads a screen reader every line of the transcript, folded or not', async () => {
    const html = await renderConsole('billing')
    const read = [...(html.match(/<ol class="sr-only">([\s\S]*?)<\/ol>/)?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, text]) => text!.trim())
    expect(read).toEqual([`$ ${consoleCommand(detent('billing'))}`, ...consoleTranscript(detent('billing')).filter(Boolean)].map(line => line.trim().replace(/'/g, '&#39;').replace(/"/g, '&quot;')))
  })

  it('folds nothing and draws no key when the transcript fits', async () => {
    // Every detent the page has folds; a short transcript stands in.
    const short: ConsoleDetent = { layer: 'agents', label: 'Agents', docs: '/docs/develop/agents', lines: [{ id: 'agent-login-path', status: 'pass', title: 'Agent sign-in route', message: 'Agent authorizations and the sign-in page agree on /login.' }] }
    const html = await renderConsole('agents', [short])
    expect(lcdRows(html)).toHaveLength(3)
    expect(html).not.toMatch(/max-sm:hidden|Show all/)
  })
})

describe('the install line', () => {
  // The hero installs into an app you already have: the Quickstart's
  // existing-app tab, beside the starter template's.
  it('is the Quickstart\'s first command for an existing app', () => {
    const quickstart = read(contentFile('/docs/start/quickstart'))
    const existingApp = quickstart.match(/```bash \[existing app\]\n([^\n]+)/)?.[1]
    expect(existingApp).toBe(INSTALL_COMMAND)
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

// The agents and closing sections are made of the parts the hero and the
// console are (website/design.md §6): labels are `stamp`s, titles are
// cut, panels are plaques and wells are slots, with no recipe of their own.
describe('the sections after the console', () => {
  const LEGACY = ['engraved', 'engraved-sm', 'embossed', 'embossed-sm', 'noise', 'hbtn', 'hbtn--primary', 'eyebrow']
  it.each(['Modules', 'AllInOne', 'ClosingCta'])('%s has no style block, no hand-rolled label and no legacy recipe', (name) => {
    const source = read(`website/components/home/${name}.vue`)
    expect(source).not.toMatch(/<style\b|text-transform|\buppercase\b|letter-spacing|tracking-/)
    const classes = [...source.matchAll(/\sclass="([^"]*)"/g)].flatMap(([, list]) => list!.split(/\s+/))
    expect(classes.filter(name => LEGACY.includes(name))).toEqual([])
    expect(classes).toContain('stamp')
    expect(classes).toContain('plaque')
  })
})

describe('the layers and the services', () => {
  it('names every app layer of the release, in its order, once', () => {
    expect(HOME_MODULES.map(module => module.layer)).toEqual(APP_CAPABILITY_IDS)
  })

  it.each(HOME_MODULES.map(module => [module.layer, module.docs] as const))('%s links to docs that exist', (_layer, docs) => {
    expect(() => contentFile(docs)).not.toThrow()
  })

  it('says how many layers and services there are where the hero counts them', () => {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
    expect(read('website/components/home/Hero.vue')).toContain(`${words[HOME_MODULES.length]} layers · ${words[HOME_SERVICES.length]} services`)
  })
})

describe('the all-in-one section', () => {
  it.each(HOME_TRAITS.map(trait => [trait.title, trait.link.to] as const))('%s links to docs that exist', (_title, to) => {
    expect(() => contentFile(to)).not.toThrow()
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
    expect(closing).toMatch(new RegExp(`<Key\\s+to="${go}">`))
  })

  // GO is the one primary key on a page (design.md §6): the hero's.
  it('leaves the page\'s one GO key to the hero', () => {
    const lit = walk('website/components/home', ['.vue']).filter(file => /signal="go"/.test(read(file)))
    expect(lit.map(file => file.slice(file.lastIndexOf('/') + 1))).toEqual(['Hero.vue'])
    expect(read('website/components/home/Hero.vue').match(/signal="go"/g)).toHaveLength(1)
  })

  // The send-off is cut into the plate as the hero's title is: one `cut`
  // per line, each repeating its text for the floor.
  it('cuts its title into the plate, a line at a time', async () => {
    const html = markup(await renderComponent(component('website/components/home/ClosingCta.vue', { '~~/shared/site': { SITE } }), {}, { ...parts(), HomeCommandSlot: commandSlot() }))
    const title = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''
    const lines = [...title.matchAll(/<span class="cut" data-text="([^"]+)">([^<]+)<\/span>/g)].map(([, floor, text]) => [floor, text])
    // A word joiner holds the package name together on a phone; it reads as nothing.
    expect(title).toContain('nuxt-\u2060backend')
    expect(lines.map(line => line.map(text => text!.replace('\u2060', '')))).toEqual([['Install the module.', 'Install the module.'], ['Run nuxt-backend dev. Ship.', 'Run nuxt-backend dev. Ship.']])
    expect(html).toContain('aria-label="Copy the install command"')
    expect(html).toContain('<span class="stamp">Ready in one command</span>')
  })
})

describe('the backend client', () => {
  const components = siteComponents()
  const chrome = [...components.keys()].filter(name => name.startsWith('App'))
  const blocks = namedComponents(read('website/content/index.md'))

  it('is never loaded by the homepage, nor by the chrome around every page', () => {
    expect(blocks).toEqual(['HomeHero', 'HomeModules', 'HomeConsole', 'HomeAllInOne', 'HomeClosingCta'])
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

  // The hero's paragraph is the one the homepage's Markdown for agents opens with.
  it('leads with the paragraph in shared/site.ts', () => {
    expect(read('website/components/home/Hero.vue')).toContain('{{ SITE.lead }}')
  })

  it('reads as one title: what it does, what it runs on, the name once', () => {
    const title = template!.replace('%s', SITE.seoTitle)
    expect(title).toBe('Auth, billing, email and AI for Nuxt apps on Convex · Nuxt backend')
    expect(title).not.toMatch(/\.\s·/)
    expect(title.match(/backend/gi)).toHaveLength(1)
    expect(title).toContain('Convex')
  })
})
