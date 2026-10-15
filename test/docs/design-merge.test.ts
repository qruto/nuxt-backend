import { describe, expect, it } from 'vitest'
import { read } from './helpers'

// The parts in Nuxt UI slot strings (website/app.config.ts `ui.tv.twMergeConfig`).
// A part's class group conflicts with what the part draws, so tailwind-merge
// drops the component's own classes for it. A part that replaces a border or
// a radius has to replace every side and corner of it: a `border-b` or a
// `rounded-t-md` the component also names would otherwise outlive the part
// (a currentColor line under the header, a 12px corner on a 16px plate).

/**
 * tailwind-merge's own class groups, read from the types it ships: the site
 * reaches tailwind-merge only through Nuxt UI, so this reads the installed
 * version rather than importing it.
 */
const GROUPS = read('node_modules/tailwind-merge/dist/types.d.ts')
  .match(/type DefaultClassGroupIds = ([^;]+);/)![1]!
  .split('|')
  .map(id => id.trim().replace(/^'|'$/g, ''))

// app.config.ts calls Nuxt's auto-imported `defineAppConfig`.
;(globalThis as { defineAppConfig?: (config: unknown) => unknown }).defineAppConfig = config => config
const { default: appConfig } = await import('../../website/app.config')
const { classGroups, conflictingClassGroups } = (appConfig as unknown as {
  ui: { tv: { twMergeConfig: { extend: { classGroups: Record<string, string[]>, conflictingClassGroups: Record<string, string[]> } } } }
}).ui.tv.twMergeConfig.extend

describe('the parts in Nuxt UI slot strings', () => {
  it('read tailwind-merge\'s groups', () => {
    expect(GROUPS).toContain('rounded-tl')
    expect(GROUPS).toContain('border-w-b')
  })

  it('conflict only with groups tailwind-merge has, or with each other', () => {
    for (const [part, groups] of Object.entries(conflictingClassGroups)) {
      for (const group of groups) expect([...GROUPS, ...Object.keys(classGroups)], `${part} → ${group}`).toContain(group)
    }
  })

  it.each(['rounded', 'border-w', 'border-color'])('replace %s on every side and corner when they replace it at all', (family) => {
    const members = GROUPS.filter(id => id === family || id.startsWith(`${family}-`))
    expect(members.length).toBeGreaterThan(9)
    for (const [part, groups] of Object.entries(conflictingClassGroups)) {
      if (groups.some(group => members.includes(group))) expect(groups, part).toEqual(expect.arrayContaining(members))
    }
  })
})
