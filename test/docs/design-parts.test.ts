import { describe, expect, it } from 'vitest'
import { parse } from 'vue/compiler-sfc'
import { expected } from '../../scripts/sync-panels.mjs'
import { read, walk } from './helpers'

/** The site files Panels' sync writes (site-relative): the template's, not the site's design. */
const synced = new Set(expected().keys())

// The parts vocabulary (website/design.md §Parts) and the ratchet that moves
// the site onto it: the parts files hold only parts, every part is in the
// gallery and the design doc, the merge groups name only parts, the site uses
// three font families, and hand-written component CSS only goes down.

const PART_FILES = ['website/assets/css/depth.css', 'website/assets/css/console.css']

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The top-level blocks of a stylesheet: each block's prelude and body. */
function topLevelBlocks(css: string): { prelude: string, body: string }[] {
  const blocks: { prelude: string, body: string }[] = []
  const text = stripComments(css)
  let depth = 0
  let start = 0
  let open = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) open = i
      depth++
    }
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        blocks.push({ prelude: text.slice(start, open).trim(), body: text.slice(open + 1, i) })
        start = i + 1
      }
    }
  }
  expect(text.slice(start).trim(), 'text after the last block').toBe('')
  return blocks
}

/** Declarations at the body's own level, nested blocks left out. */
function ownDeclarations(body: string): string[] {
  let depth = 0
  let flat = ''
  for (const char of body) {
    if (char === '{') depth++
    if (depth === 0) flat += char
    if (char === '}') depth--
  }
  return flat.split(';').map(part => part.trim()).filter(Boolean)
}

const blocks = PART_FILES.flatMap(file => topLevelBlocks(read(file)).map(block => ({ ...block, file })))
const parts = blocks
  .filter(block => block.prelude.startsWith('@utility '))
  .map(block => ({
    name: block.prelude.slice('@utility '.length),
    // A modifier only sets custom properties its part reads.
    modifier: ownDeclarations(block.body).every(declaration => declaration.startsWith('--')),
  }))
const names = parts.map(part => part.name)

describe('the parts files', () => {
  it.each(blocks.map(block => [`${block.file}: ${block.prelude}`, block] as const))('%s is a part, keyframes or a registered property, never a plain selector', (_label, block) => {
    expect(block.prelude).toMatch(/^@(?:utility [a-z][a-z0-9-]*|keyframes [a-z][a-z0-9-]*|property --[a-z][a-z0-9-]*)$/)
  })

  it('declares each part once', () => {
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(PART_FILES)('%s uses no @apply (a part is one complete recipe)', (file) => {
    expect(stripComments(read(file))).not.toMatch(/@apply\b/)
  })
})

/**
 * The class names a Vue file writes: its static `class` attributes, and the
 * string literals of its `:class` bindings and its script, where the part
 * components spell out their dynamic classes. Comments and tags never
 * count, so a `<slot>` is not the `slot` part and a doc comment that names
 * `px` does not put a glyph on the page.
 */
/** A template without its `<!-- … -->` comments, cut by index rather than a pattern. */
function withoutHtmlComments(template: string): string {
  let kept = ''
  let from = 0
  for (let start = template.indexOf('<!--'); start !== -1; start = template.indexOf('<!--', from)) {
    kept += template.slice(from, start)
    const end = template.indexOf('-->', start + 4)
    if (end === -1) return kept
    from = end + 3
  }
  return kept + template.slice(from)
}

function classTokens(vue: string): Set<string> {
  // The SFC compiler splits the blocks; nothing here filters markup.
  const { descriptor } = parse(vue)
  const template = withoutHtmlComments(descriptor.template?.content ?? '')
  const script = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  const tokens = new Set<string>()
  const add = (list: string) => list.split(/\s+/).filter(Boolean).forEach(token => tokens.add(token))
  for (const [, list] of template.matchAll(/\sclass="([^"]*)"/g)) add(list!)
  for (const [, binding] of template.matchAll(/\s:class="([^"]*)"/g)) {
    for (const [, literal] of binding!.matchAll(/'([^']*)'/g)) add(literal!)
  }
  for (const [, literal] of script.matchAll(/'([^'\n]*)'/g)) add(literal!)
  return tokens
}

/** The body of a block nested in a part (`&::after { … }`). */
function nestedBody(body: string, prelude: string): string {
  const open = body.indexOf('{', body.indexOf(`${prelude} {`))
  expect(open, prelude).toBeGreaterThan(-1)
  let depth = 0
  for (let i = open; i < body.length; i++) {
    if (body[i] === '{') depth++
    if (body[i] === '}' && --depth === 0) return body.slice(open + 1, i)
  }
  throw new Error(`${prelude} is not closed`)
}

describe('the relief and the dial', () => {
  const part = (name: string) => blocks.find(block => block.prelude === `@utility ${name}`)!.body

  // A title that wraps keeps a floor on every line: a mask one line tall
  // repeats, where a clip would cut the whole box once.
  it('cut lays its floor on every line', () => {
    const floor = nestedBody(part('cut'), '&::after')
    expect(floor).toMatch(/mask:[^;]*\dlh\b/)
    expect(floor).not.toMatch(/clip-path/)
  })

  // The knob stays lit from the top-left at every detent: only the pointer
  // and the ridges read the angle.
  it('dial turns its pointer and its ridges, never its lit face', () => {
    const own = ownDeclarations(part('dial'))
    expect(own.filter(declaration => /^(?:rotate|transform)\s*:/.test(declaration))).toEqual([])
    expect(own.find(declaration => declaration.startsWith('background'))).toContain('from var(--dial-angle)')
    expect(nestedBody(part('dial'), '&::after')).toMatch(/rotate:\s*var\(--dial-angle\)/)
  })
})

describe('every part', () => {
  const shown = new Set(['website/pages/__parts.vue', ...['Led', 'Strip', 'Key', 'Lcd', 'Console', 'EngravedTitle', 'Dial'].map(name => `website/components/${name}.vue`)]
    .flatMap(file => [...classTokens(read(file))]))
  const design = read('website/design.md')

  it.each(names)('%s is shown in the /__parts gallery, as a class', (name) => {
    expect(shown.has(name)).toBe(true)
  })

  it('counts a class, never a tag or a comment', () => {
    const tokens = classTokens('<template><!-- a `px` glyph --><slot /><span class="lcd-row" :class="{ \'led-ok\': on }" /></template>\n<script setup lang="ts">\n// \'pxled\'\nconst TONE = { warn: \'led-warn\' }\n</script>')
    expect([...tokens].sort()).toEqual(['lcd-row', 'led-ok', 'led-warn'])
  })

  it.each(names)('%s is documented in design.md', (name) => {
    expect(design).toContain(`\`${name}\``)
  })
})

describe('the merge groups', () => {
  const config = read('website/app.config.ts')
  const section = (key: string) => {
    const start = config.indexOf(`${key}: {`)
    expect(start, key).toBeGreaterThan(-1)
    return config.slice(start, config.indexOf('},', start))
  }
  const groups = Object.fromEntries([...section('classGroups').matchAll(/'([\w-]+)': \[([^\]]*)\]/g)]
    .map(([, group, list]) => [group!, [...list!.matchAll(/'([\w-]+)'/g)].map(([, name]) => name!)]))
  const conflicts = [...section('conflictingClassGroups').matchAll(/'([\w-]+)': \[/g)].map(([, group]) => group!)

  it('name only parts, never a modifier', () => {
    const grouped = Object.values(groups).flat()
    expect(grouped.length).toBeGreaterThan(10)
    for (const name of grouped) {
      expect(names, name).toContain(name)
      expect(parts.find(part => part.name === name)!.modifier, `${name} is a modifier`).toBe(false)
    }
  })

  it('give every group what it conflicts with', () => {
    expect(conflicts.sort()).toEqual(Object.keys(groups).sort())
  })
})

describe('type', () => {
  const FAMILIES = ['Anybody', 'Martian Mono', 'Handjet']
  // The metric-matched faces a stack falls back on while its family loads (app.css).
  const FALLBACKS = FAMILIES.map(family => `${family} Fallback`)
  const GENERIC = new Set(['ui-sans-serif', 'system-ui', 'sans-serif', '-apple-system', 'Segoe UI', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace', 'inherit'])
  const sources = [
    ...walk('website', ['.css', '.vue'], path => /\/(?:node_modules|\.nuxt|\.output|\.data|content)(?:\/|$)/.test(path)),
  ]

  it('loads exactly three families', () => {
    const config = read('website/nuxt.config.ts')
    const fonts = config.slice(config.indexOf('  fonts: {'), config.indexOf('\n  },', config.indexOf('  fonts: {')))
    expect([...fonts.matchAll(/name: '([^']+)'/g)].map(([, name]) => name)).toEqual(FAMILIES)
  })

  // A family list: quoted names in either quote, or bare ones, up to the
  // end of the declaration. A quote that closes a Vue `style` attribute ends it.
  const LIST = /((?:"[^"\n;<>]*"(?=\s*(?:[,;}']|$))|'[^'\n;<>]*'(?=\s*(?:[,;}"]|$))|[^;}"'<>\n])+)/
  const FAMILY_DECLARATION = new RegExp(`(?:font-family|--font-[a-z]+|--display|--font|--mono|--lcd)\\s*:\\s*${LIST.source}`, 'g')
  // The `font` shorthand names its families after the size: `600 14px/1.2 "Anybody", sans-serif`.
  const FONT_SHORTHAND = new RegExp(`(?<![\\w-])font\\s*:\\s*${LIST.source}`, 'g')
  const SIZE = /^(?:[\d.]+(?:px|r?em|%|pt|ch|ex|lh|vw|vh)|(?:x{1,2}-)?(?:small|large)|medium|smaller|larger)(?:\/\S+)?$/
  // Tailwind's arbitrary family, `font-['Anybody']` or `font-[family-name:Anybody]`; a number is a weight.
  const FONT_UTILITY = /(?<![\w-])font-\[(?:family-name:)?([^\]]+)\]/g

  /** Every family a source names: in a declaration, a `font` shorthand or a utility. */
  function families(source: string): string[] {
    const lists = [...source.matchAll(FAMILY_DECLARATION)].map(([, value]) => value!)
    for (const [, value] of source.matchAll(FONT_SHORTHAND)) {
      const words = value!.trim().split(/\s+/)
      const size = words.findIndex(word => SIZE.test(word))
      if (size >= 0) lists.push(words.slice(size + 1).join(' '))
    }
    for (const [, value] of source.matchAll(FONT_UTILITY)) {
      if (!/^[\d.]+$/.test(value!) && !value!.startsWith('var(')) lists.push(value!.replace(/_/g, ' '))
    }
    return lists
      .flatMap(list => list.split(',').map(part => part.trim().replace(/^['"]|['"]$/g, '')))
      .filter(family => family && !family.startsWith('var('))
  }

  it('reads the families out of a shorthand and a utility, and a weight is not one', () => {
    expect(families('.a { font: 600 14px/1.2 "Inter", sans-serif } .b { font: inherit }')).toEqual(['Inter', 'sans-serif'])
    expect(families('<p class="font-[\'Bai_Jamjuree\'] font-[600]">')).toEqual(['Bai Jamjuree'])
  })

  it('names no other family anywhere on the site', () => {
    const stray = new Set<string>()
    for (const file of sources) {
      for (const family of families(read(file))) {
        if (!FAMILIES.includes(family) && !FALLBACKS.includes(family) && !GENERIC.has(family)) stray.add(`${file.slice(file.indexOf('website/'))}: ${family}`)
      }
    }
    expect([...stray]).toEqual([])
  })
})

describe('the part components', () => {
  const vue = walk('website', ['.vue'], path => /\/(?:node_modules|\.nuxt|\.output)(?:\/|$)/.test(path))

  // <Led> hides itself from assistive technology unless it has a label: a
  // `title` only falls through onto the hidden element.
  it('name an LED with `label`, never `title`', () => {
    const titled = vue.flatMap(file => [...read(file).matchAll(/<Led\b[^>]*>/g)]
      .filter(([tag]) => /\stitle=/.test(tag))
      .map(() => file.slice(file.indexOf('website/'))))
    expect(titled).toEqual([])
  })
})

/**
 * The module components that light a primary action of their own: their
 * stylesheets (its own, or its parts') fill a control with the accent, the
 * module's GO.
 */
const MODULE_PRIMARIES: Record<string, string[]> = {
  AccessDenied: ['AccessDenied.css'],
  AcceptInvitation: ['AcceptInvitationActions.css'],
  // The shell's header: the sign-in link, the avatar and the create button fill with the accent. No playground page renders it yet.
  AppShell: ['AppShell.css', 'AccountMenu.css', 'WorkspaceSwitcher.css'],
  AuthForm: ['AuthForm.css', 'AuthFormPasskeyOffer.css'],
  BackendNotices: ['NoticeGift.css', 'NoticeLowCredits.css', 'NoticePastDue.css'],
  ConsentPrompt: ['ConsentPrompt.css'],
  // The confirmation the admin console and the security settings ask in. Internal: no page names it.
  ConfirmDialog: ['ConfirmDialog.css'],
  ContactForm: ['ContactForm.css'],
  Gate: ['Gate.css'],
  // Its Continue button fills with the accent. No playground page renders it yet.
  HowDidYouHear: ['HowDidYouHear.css'],
  // The `/invite` page's own panel: no playground page renders it.
  InviteRedeem: ['InviteRedeem.css'],
  // The `/unsubscribe` page's own panel: no playground page renders it.
  EmailUnsubscribe: ['EmailUnsubscribe.css'],
  OnboardingFlow: ['OnboardingFlow.css'],
  PricingTable: ['PricingTable.css'],
  ProfileSettings: ['ProfileSettings.css', 'ProfileIdentity.css'],
  ReauthenticateDialog: ['ReauthenticateDialog.css'],
  // The `/r/:code` page's own panel: no playground page renders it.
  ReferralLanding: ['ReferralLanding.css'],
  SecuritySettings: ['SecurityPasskeys.css'],
  UpgradePrompt: ['UpgradePrompt.css'],
  WaitlistForm: ['WaitlistForm.css', 'WaitlistPlace.css'],
  WorkspaceSettings: ['WorkspaceList.css', 'WorkspaceBilling.css'],
}

/**
 * A module primary that lights only with an attribute: `<Gate>` draws its
 * own button (the upgrade link) for a `quota` check alone.
 */
const LIT_WITH: Record<string, RegExp> = { Gate: /\squota\b/ }

/** A module primary that never shows beside the page's own GO, by page. */
const APART: Record<string, string[]> = {}

/**
 * The module primaries no page shows beside its own GO: the "Confirm it's
 * you" dialog and the confirmation are modal, so while one is open nothing
 * of the page behind it can be pressed, and it is not on the page otherwise.
 */
const MODAL = ['ReauthenticateDialog', 'ConfirmDialog']

/** The GO keys a template lights: `signal="go"`, a `:signal` binding that can be `'go'`, a `k-go` class. */
function litKeys(source: string): string[] {
  const template = withoutHtmlComments(parse(source).descriptor.template?.content ?? '')
  return [...template.matchAll(/\ssignal="go"|\s:signal="[^"]*'go'[^"]*"|(?<![\w-])k-go(?![\w-])/g)].map(([match]) => match.trim())
}

/**
 * Every GO a page lights: its own, those of the site components it renders
 * (followed through their tags), and the primary of each module component
 * it renders, unless the page letters that one as a plain key (an
 * arbitrary `…]:k` variant on the tag) or it never shows beside the page's
 * GO (APART, MODAL). A `v-if` branch counts too: a page names its GO once.
 */
function pageGoKeys(page: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const source = read(file)
    found.push(...litKeys(source).map(key => `${file.slice(file.indexOf('website/'))}: ${key}`))
    for (const [, tag, attributes] of withoutHtmlComments(parse(source).descriptor.template?.content ?? '').matchAll(/<([A-Z][A-Za-z0-9]+)\b([^>]*)>/g)) {
      const component = `website/components/${tag}.vue`
      // The part components define the keys; they light none themselves.
      if (!['Key', 'Led'].includes(tag!) && walk('website/components', ['.vue']).some(path => path.endsWith(component))) visit(component)
      if (MODULE_PRIMARIES[tag!] && (LIT_WITH[tag!]?.test(attributes!) ?? true) && !/\]:k(?![\w-])/.test(attributes!) && !APART[page]?.includes(tag!) && !MODAL.includes(tag!)) found.push(`<${tag}>'s own primary`)
    }
  }
  visit(page)
  return found
}

// The site's own playground pages (the offline page; the rest is Panels,
// synced from templates/panels in the template's own look) are built from
// the parts (design.md §9): no CSS of their own, labels from the `stamp`
// part, and one lit GO key at most, on the page's main action.
describe('the site\'s playground pages', () => {
  const pages = walk('website/pages/playground', ['.vue']).filter(file => !synced.has(file.slice(file.indexOf('website/') + 'website/'.length))).map(file => [file.slice(file.indexOf('website/')), file] as const)

  it('are there', () => {
    expect(pages.map(([label]) => label)).toEqual(['website/pages/playground/offline.vue'])
  })

  it.each(pages)('%s has no style block and no uppercase of its own', (_label, file) => {
    const { descriptor } = parse(read(file))
    expect(descriptor.styles).toEqual([])
    expect(classTokens(read(file)).has('uppercase')).toBe(false)
  })

  it.each(pages)('%s lights one GO key at most, its components\' and the module\'s counted', (label) => {
    expect(pageGoKeys(label).length, pageGoKeys(label).join(', ')).toBeLessThanOrEqual(1)
  })

  it('knows every module component that lights a primary of its own', () => {
    const filling = walk('src/runtime/vue/components', ['.css'])
      .filter(file => /background:\s*var\(--(?:bk|auth)-accent\)/.test(read(file)))
      .map(file => file.slice(file.lastIndexOf('/') + 1))
    expect([...new Set(Object.values(MODULE_PRIMARIES).flat())].sort()).toEqual(filling.sort())
  })

  it('counts a GO wherever a page lights one', () => {
    expect(litKeys('<template><Key signal="go" /><Key :signal="ready ? \'go\' : undefined" /><a class="k k-go" /><!-- k-go --></template>')).toEqual(['signal="go"', ':signal="ready ? \'go\' : undefined"', 'k-go'])
    expect(pageGoKeys('website/pages/playground/offline.vue').length).toBeLessThanOrEqual(1)
  })
})

// The classes app.css used to carry, before the parts: none may be named
// again, in a template or in a class string in TypeScript (the Nuxt UI slot
// overrides in app.config.ts), where nothing would draw them.
describe('the legacy classes', () => {
  const LEGACY = ['btn', 'lab-label', 'prose-code', 'grid-2', 'grid-auto', 'dev-body', 'depth-surface', 'depth-border', 'depth-well', 'text-grad', 'text-grad-ink', 'engraved', 'engraved-sm', 'embossed', 'embossed-sm', 'surface-matte']
  // Single words, which count only in a static class list.
  const LEGACY_WORDS = ['card', 'well', 'pill', 'stack', 'row', 'hint', 'lead', 'mono', 'input', 'dev']
  const skip = (path: string) => /\/(?:node_modules|\.nuxt|\.output|\.data|content)(?:\/|$)/.test(path)

  it('are named in no template or script of the site', () => {
    // Panels' files are the template's, with its own classes (scripts/sync-panels.mjs).
    const named = walk('website', ['.vue'], skip).filter(file => !synced.has(file.slice(file.indexOf('website/') + 'website/'.length))).flatMap(file => [...classTokens(read(file))]
      .filter(token => LEGACY.includes(token) || (LEGACY_WORDS.includes(token) && new RegExp(`(?<![:\\w-])class="[^"]*(?<![\\w-])${token}(?![\\w-])`).test(read(file))))
      .map(token => `${file.slice(file.indexOf('website/'))}: ${token}`))
    expect(named).toEqual([])
  })

  it('are named in no class string in TypeScript', () => {
    const named = walk('website', ['.ts'], skip).flatMap(file => [...read(file).matchAll(/'([^'\n]*)'/g)]
      .flatMap(([, literal]) => literal!.split(/\s+/))
      .filter(token => LEGACY.includes(token))
      .map(token => `${file.slice(file.indexOf('website/'))}: ${token}`))
    expect(named).toEqual([])
  })
})

/**
 * Hand-written CSS in the site's components and pages, which the parts
 * replace as R3–R5 rebuild them. Both numbers only go down: when you remove
 * a style block or an uppercase label recipe, lower the number here.
 */
const STYLE_BLOCKS = 1
const UPPERCASE_RECIPES = 0

describe('the ratchet', () => {
  const vue = walk('website', ['.vue'], path => /\/(?:node_modules|\.nuxt|\.output)(?:\/|$)/.test(path))

  it('counts scoped style blocks down', () => {
    const count = vue.reduce((sum, file) => sum + [...read(file).matchAll(/<style\b/g)].length, 0)
    expect(count, 'lower STYLE_BLOCKS when you remove one; build new UI from the parts instead of adding one').toBe(STYLE_BLOCKS)
  })

  it('counts hand-rolled uppercase labels down (the `stamp` part is the recipe)', () => {
    const files = [...vue, 'website/app.css']
    const count = files.reduce((sum, file) => sum + [...read(file).matchAll(/text-transform:\s*uppercase/g)].length, 0)
    expect(count, 'lower UPPERCASE_RECIPES when you replace one with `stamp`').toBe(UPPERCASE_RECIPES)
  })
})
