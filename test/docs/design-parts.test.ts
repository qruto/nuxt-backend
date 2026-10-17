import { describe, expect, it } from 'vitest'
import { read, walk } from './helpers'
import { parse } from 'vue/compiler-sfc'

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

  it.each(PART_FILES)('%s uses no @apply (the playground copy is plain CSS)', (file) => {
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
 * Hand-written CSS in the site's components and pages, which the parts
 * replace as R3–R5 rebuild them. Both numbers only go down: when you remove
 * a style block or an uppercase label recipe, lower the number here.
 */
const STYLE_BLOCKS = 46
const UPPERCASE_RECIPES = 23

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
