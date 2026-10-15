import { describe, expect, it } from 'vitest'
import { read, walk } from './helpers'

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
  it.each(blocks.map(block => [`${block.file}: ${block.prelude}`, block] as const))('%s is a part or keyframes, never a plain selector', (_label, block) => {
    expect(block.prelude).toMatch(/^@(?:utility [a-z][a-z0-9-]*|keyframes [a-z][a-z0-9-]*)$/)
  })

  it('declares each part once', () => {
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(PART_FILES)('%s uses no @apply (the playground copy is plain CSS)', (file) => {
    expect(stripComments(read(file))).not.toMatch(/@apply\b/)
  })
})

describe('every part', () => {
  const gallery = read('website/pages/__parts.vue')
  const components = ['Led', 'Strip', 'Key', 'Lcd', 'Console', 'EngravedTitle'].map(name => read(`website/components/${name}.vue`)).join('\n')
  const design = read('website/design.md')
  const word = (name: string) => new RegExp(`(?<![\\w-])${name}(?![\\w-])`)

  it.each(names)('%s is shown in the /__parts gallery', (name) => {
    expect(word(name).test(gallery) || word(name).test(components)).toBe(true)
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
  const FAMILY_DECLARATION = /(?:font-family|--font-[a-z]+|--display|--font|--mono|--lcd)\s*:\s*((?:"[^"\n;<>]*"(?=\s*(?:[,;}']|$))|'[^'\n;<>]*'(?=\s*(?:[,;}"]|$))|[^;}"'<>\n])+)/g

  it('names no other family anywhere on the site', () => {
    const stray = new Set<string>()
    for (const file of sources) {
      for (const [, value] of read(file).matchAll(FAMILY_DECLARATION)) {
        for (const family of value!.split(',').map(part => part.trim().replace(/^['"]|['"]$/g, ''))) {
          if (family && !family.startsWith('var(') && !FAMILIES.includes(family) && !GENERIC.has(family)) stray.add(`${file.slice(file.indexOf('website/'))}: ${family}`)
        }
      }
    }
    expect([...stray]).toEqual([])
  })
})

/**
 * Hand-written CSS in the site's components and pages, which the parts
 * replace as R3–R5 rebuild them. Both numbers only go down: when you remove
 * a style block or an uppercase label recipe, lower the number here.
 */
const STYLE_BLOCKS = 56
const UPPERCASE_RECIPES = 51

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
