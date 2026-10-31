import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'
import type { Selector, SelectorComponent } from 'lightningcss'
import { describe, expect, it } from 'vitest'

// The shipped stylesheets style each component through its `data-*` hooks.
// A family's base rule for an element (every button of the sign-in form)
// must never outrank a hook that styles one of those elements: written as
// `[data-auth='form'] button` (an attribute and a type) it beat
// `[data-auth='submit']` (an attribute alone), and the primary buttons never
// took the accent in any app. A base rule wraps its family root in :where(),
// which adds nothing, so the hooks that come after it win.

const componentsDir = fileURLToPath(new URL('../../src/runtime/vue/components/', import.meta.url))
const stylesheets = (readdirSync(componentsDir, { recursive: true }) as string[]).filter(name => name.endsWith('.css'))

/** Every style rule's selectors in a stylesheet, nested rules included, in source order. */
function selectorsOf(css: string, filename: string): Selector[][] {
  const rules: Selector[][] = []
  transform({ filename, code: Buffer.from(css), visitor: { Rule: { style(rule) {
    rules.push(rule.value.selectors)
  } } } })
  return rules
}

type Specificity = [number, number, number]

const add = (a: Specificity, b: Specificity): Specificity => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const compare = (a: Specificity, b: Specificity) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** A selector's specificity, as Selectors Level 4 counts it. */
function specificity(selector: Selector): Specificity {
  return selector.reduce<Specificity>((sum, part) => add(sum, partSpecificity(part)), [0, 0, 0])
}

function partSpecificity(part: SelectorComponent): Specificity {
  switch (part.type) {
    case 'id': return [1, 0, 0]
    case 'class':
    case 'attribute': return [0, 1, 0]
    case 'type':
    case 'pseudo-element': return [0, 0, 1]
    case 'pseudo-class': {
      if (part.kind === 'where') return [0, 0, 0]
      if (part.kind === 'is' || part.kind === 'not' || part.kind === 'has') {
        return part.selectors.map(specificity).sort(compare).at(-1) ?? [0, 0, 0]
      }
      return [0, 1, 0]
    }
    default: return [0, 0, 0]
  }
}

/** The parts of a selector that count toward its specificity, :where() left out. */
const counted = (selector: Selector) => selector.filter(part => !(part.type === 'pseudo-class' && part.kind === 'where'))

describe('the component stylesheets', () => {
  it('count a :where() root as nothing, and an attribute or a type as itself', () => {
    const first = (css: string, index = 0) => selectorsOf(css, 'probe.css')[index]![0]!
    const probe = ':where([data-auth=\'form\']) button {} [data-auth=\'submit\'] {}'
    const hook = specificity(first(probe, 1))
    expect(specificity(first(probe))).toEqual([0, 0, 1])
    expect(hook).toEqual([0, 1, 0])
    expect(compare(specificity(first('[data-auth=\'form\'] button {}')), hook)).toBeGreaterThan(0)
  })

  it.each(stylesheets)('%s never adds a type to a hook outside :where()', (name) => {
    const css = readFileSync(join(componentsDir, name), 'utf8')
    const offenders = selectorsOf(css, name).flat().filter((selector) => {
      const parts = counted(selector)
      return parts.some(part => part.type === 'type') && parts.some(part => part.type === 'attribute')
    })
    expect(offenders.map(selector => JSON.stringify(selector))).toEqual([])
  })

  it('lets the sign-in form\'s button hooks win over its button base', () => {
    const rules = selectorsOf(readFileSync(join(componentsDir, 'auth/AuthForm.css'), 'utf8'), 'auth/AuthForm.css')
    const baseIndex = rules.findIndex(selectors => selectors.some(selector => selector.some(part => part.type === 'type' && part.name === 'button')))
    expect(baseIndex).toBeGreaterThan(-1)
    const base = specificity(rules[baseIndex]!.find(selector => selector.some(part => part.type === 'type'))!)
    for (const hook of ['submit', 'passkey-sign-in', 'back', 'skip']) {
      const index = rules.findIndex(selectors => selectors.some(selector => selector.length === 1 && selector[0]!.type === 'attribute' && selector[0]!.operation?.value === hook))
      expect(index, hook).toBeGreaterThan(baseIndex)
      const selector = rules[index]!.find(selector => selector[0]!.type === 'attribute' && selector[0]!.operation?.value === hook)!
      expect(compare(specificity(selector), base), hook).toBeGreaterThanOrEqual(0)
    }
  })
})
