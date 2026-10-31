import { describe, expect, it } from 'vitest'
import { UI_INTERNALS, UI_PARTS, uiPath, type UiEntry } from '../../src/ui/registry'
import { COMPONENT_CONTRACT, CONTRACT_EXEMPT } from '../nuxt/component-contract'
import { contentFile, read } from './helpers'

// The component contract's rows (test/nuxt/component-contract.ts) are what
// the docs promise: the Components reference lists each component's family,
// label group, slots, events and states, and the Accessibility page its
// guarantee word for word. A row that changes changes both pages.

const components = read(contentFile('/docs/reference/components'))
const accessibility = read('website/content/docs/04.build/7.ui/5.accessibility.md')
const rows = Object.entries(COMPONENT_CONTRACT)

/** The table row a page gives a component: the line that starts with its tag. */
const rowOf = (page: string, name: string) => page.split('\n').find(line => line.startsWith(`| \`<${name}>\` |`))
/** The components a page has a one-component row for, in the section under `heading` (or the whole page). */
const rowNames = (page: string, heading?: string) => {
  const from = heading ? page.indexOf(heading) : 0
  const to = heading ? page.indexOf('\n## ', from + 1) : -1
  const section = page.slice(from, to === -1 ? undefined : to)
  return [...section.matchAll(/^\| `<(\w+)>` \|/gm)].map(([, name]) => name!)
}

describe('the Components reference', () => {
  it.each(rows)('lists <%s> with its family, labels, slots, events and states', (name, row) => {
    const line = rowOf(components, name)
    expect(line, name).toBeDefined()
    const cells = line!.split(' | ')
    expect(cells[1]).toBe(row.family ? `\`data-${row.family}\`` : 'none: only your slots')
    if (row.labels) expect(cells[2]).toBe(`\`${row.labels}\``)
    expect(cells[3]).toBe(row.slots.length ? row.slots.map(slot => `\`${slot}\``).join(', ') : 'none')
    expect(cells[4]).toBe(row.emits.length ? row.emits.map(event => `\`${event}\``).join(', ') : 'none')
    expect(cells[5]).toBe(`${row.states.join(', ')} |`)
  })

  it('lists no component the contract does not have', () => {
    expect(rowNames(components, '## The package\'s components').sort()).toEqual(Object.keys(COMPONENT_CONTRACT).sort())
  })

  it('names every component exempt from the contract', () => {
    for (const name of Object.keys(CONTRACT_EXEMPT)) expect(components, name).toContain(`\`<${name}>\``)
  })
})

describe('the Accessibility page', () => {
  it('has a row for exactly the contracted components', () => {
    expect(rowNames(accessibility, '## What each component guarantees').sort()).toEqual(Object.keys(COMPONENT_CONTRACT).sort())
  })

  it.each(rows)('gives <%s>\'s guarantee as its row says it', (name, row) => {
    expect(rowOf(accessibility, name), name).toBe(`| \`<${name}>\` | ${row.a11y} |`)
  })
})

describe('the Parts reference', () => {
  const parts = read(contentFile('/docs/reference/components/parts'))
  /** The part rows of the page: `| \`AuthFormCode\` | region | receives | hook |`. */
  const listed = [...parts.matchAll(/^\| `(\w+)` \| .+ \| (`data-[^|]+) \|$/gm)].map(([, name, hooks]) => ({ name: name!, hooks: hooks! }))

  it('lists every registered part, and no other', () => {
    expect(listed.map(row => row.name).sort()).toEqual(UI_PARTS.map(part => part.name).sort())
  })

  /** A packaged file's template, with the templates of the internal pieces it renders by tag (the admin list's frame). */
  const templateOf = (entry: Pick<UiEntry, 'folder' | 'name'>): string => {
    const source = read(`src/runtime/vue/components/${uiPath(entry)}.vue`)
    const template = source.slice(source.indexOf('<template>'))
    const pieces = UI_INTERNALS.filter(piece => new RegExp(`<${piece.name}[\\s/>]`).test(template))
    return [template, ...pieces.map(templateOf)].join('\n')
  }

  it.each(UI_PARTS.map(part => [part.name, part] as const))('gives %s the hook its packaged source carries', (name, part) => {
    const row = listed.find(candidate => candidate.name === name)
    expect(row, name).toBeDefined()
    const template = templateOf(part)
    const hooks = [...row!.hooks.matchAll(/`(data-[\w-]+)="([\w-]+)"`/g)]
    expect(hooks.length, name).toBeGreaterThan(0)
    // A shared piece names its hook through its family's helper: `hook('cancel-confirm')`.
    for (const [, attribute, value] of hooks) expect(template.includes(`${attribute}="${value}"`) || template.includes(`hook('${value}')`), `${name}: ${attribute}="${value}"`).toBe(true)
  })
})
