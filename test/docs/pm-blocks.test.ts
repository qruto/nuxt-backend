import { describe, expect, it } from 'vitest'
import * as vue from 'vue'
import { enrichPage } from '../../website/modules/docs-pages'
import { pmVariants, retoken, wrapPmBlocks, type Token } from '../../website/shared/pm-blocks'
import { openTwin } from '../../website/shared/agent-markdown'
import { LLMS_DETAILS } from '../../website/shared/agent-surfaces'
import * as pm from '../../website/shared/pm'
import { read } from './helpers'
import { component, renderComponent } from './sfc'

// The docs' bash blocks in every package manager (website/shared/pm-blocks.ts,
// components/PmCode.vue): a block whose commands all convert is wrapped as
// the page is parsed, its variants ride in a prop, and the page's text —
// what search indexes, what the twins and llms-full.txt print — stays npm.

type Node = string | [string, Record<string, unknown>, ...Node[]]

const SHIKI = 'language-bash shiki shiki-themes nuxt-backend-light nuxt-backend-light nuxt-backend-dark'

/** A bash block as Nuxt Content stores it: one line per span, Shiki's classes on the tokens, each line's newline in its last token. */
function pre(lines: Array<Array<[string, string]>>, props: Record<string, unknown> = {}): Node {
  const code = lines.map(line => line.map(([, text]) => text).join('')).join('')
  return ['pre', { className: SHIKI, code, language: 'bash', meta: '', style: '', ...props },
    ['code', { __ignoreMap: '' }, ...lines.map((line, i): Node => ['span', { class: 'line', line: i + 1 }, ...line.map(([className, text]): Node => ['span', { class: className }, text])])]]
}

// `npx nuxt module add nuxt-backend` / `npm install convex`, as the quickstart's block is stored.
const install = () => pre([
  [['s2JfK', 'npx '], ['sqdZd', 'nuxt'], ['sqdZd', ' module'], ['sqdZd', ' add'], ['sqdZd', ' nuxt-backend\n']],
  [['s2JfK', 'npm '], ['sqdZd', 'install'], ['sqdZd', ' convex\n']],
])

/** Every word a page's text holds, as search reads it: text children only, never props. */
function text(nodes: Node[]): string {
  return nodes.map(node => typeof node === 'string' ? node : text(node.slice(2) as Node[])).join('')
}

const page = (...value: Node[]) => ({ body: { type: 'minimark', value } })

describe('a converted block', () => {
  it('wraps the npm block, its variants in a prop', () => {
    const body = page(install())
    enrichPage(body, undefined)
    const [tag, props, child] = body.body.value[0] as [string, { variants: Array<{ pm: string, code: string, lines: Token[][] }>, preClass: string }, Node]
    expect(tag).toBe(pm.PM_TAG)
    expect(child).toEqual(install())
    expect(props.preClass).toBe(SHIKI)
    expect(props.variants.map(({ pm, code }) => [pm, code])).toEqual([
      ['pnpm', 'pnpm nuxt module add nuxt-backend\npnpm add convex\n'],
      ['yarn', 'yarn nuxt module add nuxt-backend\nyarn add convex\n'],
      ['bun', 'bunx nuxt module add nuxt-backend\nbun add convex\n'],
    ])
  })

  it('colours each variant as its npm block: the manager as the command, new words as arguments', () => {
    const variants = pmVariants(install() as never)!
    const bun = variants.find(variant => variant.pm === 'bun')!
    expect(bun.lines).toEqual([
      [['s2JfK', 'bunx'], ['s2JfK', ' '], ['sqdZd', 'nuxt'], ['sqdZd', ' module'], ['sqdZd', ' add'], ['sqdZd', ' nuxt-backend\n']],
      [['s2JfK', 'bun'], ['sqdZd', ' add'], ['sqdZd', ' convex\n']],
    ])
    expect(bun.lines.map(line => line.map(([, text]) => text).join('')).join('')).toBe(bun.code)
  })

  it('keeps the tokens of what a line shares with npm at either end', () => {
    const tokens: Token[] = [['env', 'CONVEX_AGENT_MODE=anonymous'], ['', ' '], ['cmd', 'npm'], ['arg', ' run'], ['arg', ' dev'], ['', '   '], ['comment', '# the dev script']]
    expect(retoken(tokens, 'CONVEX_AGENT_MODE=anonymous npm run dev   # the dev script', 'CONVEX_AGENT_MODE=anonymous pnpm dev   # the dev script')).toEqual([
      ['env', 'CONVEX_AGENT_MODE=anonymous'], ['', ' '], ['cmd', 'pnpm'], ['arg', ' dev'], ['', '   '], ['comment', '# the dev script'],
    ])
    const flags: Token[] = [['cmd', 'npm'], ['arg', ' i'], ['flag', ' -D'], ['arg', ' x']]
    expect(retoken(flags, 'npm i -D x', 'bun add -d x')).toEqual([['cmd', 'bun'], ['arg', ' add'], ['flag', ' -d'], ['arg', ' x']])
  })

  it('keeps comment lines, blank lines and other commands token for token', () => {
    const block = pre([
      [['comment', '# a specific PR\n']],
      [['cmd', 'npm '], ['arg', 'install'], ['arg', ' x\n']],
      [['', '\n']],
      [['cmd', 'cd '], ['arg', 'my-app\n']],
    ])
    const pnpm = pmVariants(block as never)!.find(variant => variant.pm === 'pnpm')!
    expect(pnpm.lines[0]).toEqual([['comment', '# a specific PR\n']])
    expect(pnpm.lines[2]).toEqual([['', '\n']])
    expect(pnpm.lines[3]).toEqual([['cmd', 'cd '], ['arg', 'my-app\n']])
    expect(pnpm.code).toBe('# a specific PR\npnpm add x\n\ncd my-app\n')
  })
})

describe('a block that stays npm', () => {
  it('opts out with a filename: ```bash [npm]', () => {
    const block = pre([[['cmd', 'npm '], ['arg', 'install'], ['arg', ' convex\n']]], { filename: 'npm' })
    const body = [block]
    wrapPmBlocks(body)
    expect(body).toEqual([block])
  })

  it('sits in a code group, which names its own variants, or is not bash', () => {
    const grouped: Node = ['code-group', {}, install()]
    const ts = pre([[['cmd', 'npm '], ['arg', 'install\n']]], { language: 'ts' })
    const body = [grouped, ts]
    wrapPmBlocks(body)
    expect(body).toEqual([['code-group', {}, install()], ts])
  })

  it('names npm in a way the converter cannot read, or runs no npm at all', () => {
    const quoted = pre([[['cmd', 'npx '], ['arg', 'convex'], ['arg', ' deploy'], ['flag', ' --cmd'], ['str', ' \'npm run build\'\n']]])
    const pnpmOnly = pre([[['cmd', 'pnpm '], ['arg', 'add'], ['arg', ' @convex-dev/agent\n']]])
    const body = [quoted, pnpmOnly]
    wrapPmBlocks(body)
    expect(body).toEqual([quoted, pnpmOnly])
  })

  it('is wrapped once, however often the page is enriched, at any depth', () => {
    const body = page(['steps', { level: '3' }, ['h3', {}, 'Install'], install()])
    enrichPage(body, undefined)
    enrichPage(body, undefined)
    const steps = body.body.value[0] as Node[]
    expect((steps[3] as Node[])[0]).toBe(pm.PM_TAG)
    expect((steps[3] as Node[])[2]).toEqual(install())
  })
})

describe('the page\'s text', () => {
  it('is npm alone, as search reads it', () => {
    const body = page(['p', {}, 'Install it:'], install())
    enrichPage(body, undefined)
    const words = text(body.body.value)
    expect(words).toContain('npm install convex')
    expect(words).not.toMatch(/pnpm|yarn|bunx?\b/)
  })

  it('is npm alone in the twin, which gives the wrapper up and says so once in its header', () => {
    const body = page(['p', {}, 'Install it:'], install())
    enrichPage(body, undefined)
    openTwin(body.body, { path: '/docs/start/quickstart', kind: 'tutorial' })
    const value = body.body.value
    expect(value.filter(node => Array.isArray(node) && node[0] === 'p' && node[2] === pm.PM_NOTE)).toHaveLength(1)
    expect(value.at(-1)).toEqual(install())
    expect(JSON.stringify(value)).not.toContain(pm.PM_TAG)
    expect(text(value)).not.toMatch(/pnpm|yarn|bunx?\b/)
  })

  it('is npm in llms.txt, whose preamble says so once', () => {
    expect(LLMS_DETAILS.filter(block => block.includes(pm.PM_NOTE))).toHaveLength(1)
  })
})

describe('<PmCode>', () => {
  const icons = { npm: 'i-simple-icons-npm', pnpm: 'i-simple-icons-pnpm', yarn: 'i-simple-icons-yarn', bun: 'i-simple-icons-bun' }
  const choice = (current: pm.PackageManager) => component('website/components/PmChoice.vue', { '~~/shared/pm': pm }, {
    usePackageManager: () => ({ pm: vue.ref(current), choose: () => {} }),
    useAppConfig: () => ({ ui: { prose: { codeIcon: icons } } }),
  })
  /** Nuxt UI's prose `pre`, as the code it copies and the lines it holds. */
  const ProsePre = vue.defineComponent({
    inheritAttrs: false,
    props: { code: { type: String, required: true }, language: { type: String, required: true } },
    setup: (props, { slots, attrs }) => () => vue.h('div', { 'data-copies': props.code }, vue.h('pre', { class: attrs.class }, slots.default?.())),
  })

  it('renders all four variants, npm from the page and the rest from its prop, each copying its own', async () => {
    const variants = pmVariants(install() as never)!
    const html = await renderComponent(component('website/components/PmCode.vue'), { variants, preClass: SHIKI }, { PmChoice: choice('npm'), ProsePre }, 'npm install convex')
    expect([...html.matchAll(/data-pm-variant="(\w+)"/g)].map(([, name]) => name)).toEqual(['npm', 'pnpm', 'yarn', 'bun'])
    expect(html).toMatch(/<div data-pm-variant="npm">(?:<!--\[-->)?npm install convex(?:<!--\]-->)?<\/div>/)
    for (const { code } of variants) expect(html).toContain(`data-copies="${code}"`)
    expect(html.replaceAll(/<!--[[\]]-->/g, '')).toContain(`<pre class="${SHIKI}"><span class="line"><span class="s2JfK">pnpm</span>`)
  })

  it('picks through a labelled radio group, one key per manager, with one tab stop', async () => {
    const html = await renderComponent(choice('pnpm'), { label: 'Package manager', labels: true })
    expect(html).toMatch(/^<div role="radiogroup" aria-label="Package manager"/)
    const radios = [...html.matchAll(/<button type="button" role="radio" aria-checked="(\w+)" tabindex="(-?\d)" data-pm-option="(\w+)"/g)].map(([, checked, tabindex, name]) => [name, checked, tabindex])
    expect(radios).toEqual([['npm', 'false', '-1'], ['pnpm', 'true', '0'], ['yarn', 'false', '-1'], ['bun', 'false', '-1']])
    expect(html).toContain('data-icon="i-simple-icons-bun"')
    const marks = await renderComponent(choice('npm'), { labelledby: 'commands' })
    expect(marks).toMatch(/^<div role="radiogroup" aria-labelledby="commands"/)
    expect(marks).toContain('aria-label="yarn"')
  })

  it('is drawn for every manager by CSS off html[data-pm], npm without it', () => {
    const css = read('website/app.css')
    expect(css).toContain('[data-pm-variant]:not([data-pm-variant=\'npm\'])')
    expect(css).toContain(':root:not([data-pm]) [data-pm-option=\'npm\']')
    for (const name of pm.OTHER_PACKAGE_MANAGERS) {
      expect(css).toContain(`:root[data-pm='${name}'] [data-pm-variant='npm']`)
      expect(css).toContain(`:root[data-pm='${name}'] [data-pm-variant='${name}']`)
      expect(css).toContain(`:root[data-pm='${name}'] [data-pm-option='${name}']`)
    }
  })

  it('uses the marks app.config.ts maps for code blocks', () => {
    const config = read('website/app.config.ts')
    for (const [name, icon] of Object.entries(icons)) expect(config).toContain(`'${name}': '${icon}'`)
  })
})

describe('the head script', () => {
  const plugin = read('website/plugins/package-manager.ts')

  // nuxt-security stamps its nonce on every script the server renders into
  // the page (a hash, on a prerendered one): an inline script registered
  // through useHead, on the server only, so the client never inserts one of
  // its own that the CSP would refuse.
  it('reaches the head through useHead on the server, inline, as early as it can', () => {
    expect(plugin).toMatch(/if \(import\.meta\.server\) \{\n\s+useHead\(\{ script: \[\{ key: 'package-manager', innerHTML: PM_HEAD_SCRIPT, tagPriority: 'critical' \}\] \}\)\n\s+return\n\s+\}/)
    expect(plugin).not.toMatch(/\bsrc:/)
    expect(read('website/nuxt.config.ts')).toContain('nonce-{{nonce}}')
  })

  it('sets no cookie, so a page prerenders and caches as it is', () => {
    expect(pm.PM_HEAD_SCRIPT).not.toContain('cookie')
    expect(plugin).not.toMatch(/useCookie|document\.cookie/)
    expect(read('website/composables/usePackageManager.ts')).not.toMatch(/useCookie|document\.cookie/)
  })
})
