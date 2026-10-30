import { relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_NAME, root, siblingOrigin, TRY_FLAGS } from '../../scripts/try/kit.mjs'
import { NOTES_FILE } from '../../scripts/try/notes.mjs'
import { PERSONAS } from '../../scripts/try/personas.mjs'
import { CAPABILITIES } from '../../src/capabilities/registry'
import { playgroundRoutes } from '../helpers/playground-routes'
import { read } from './helpers'

// The Try everything guide is the review checklist of `pnpm try`: every
// playground page (Panels' and the module's under /playground) has a row in
// it, under its capability's section, and every persona the kit seeds is in
// its table. A page or a persona added later fails here until the guide says
// how to try it.

const GUIDE = 'website/content/docs/01.start/5.playground/1.try-everything.md'
const text = read(GUIDE)
const checklist = text.slice(text.indexOf('## The checklist'), text.indexOf('## Related'))

/** The checklist's sections by their heading, each with the playground routes its rows link. */
const sections = new Map(checklist.split(/^### /m).slice(1).map((section) => {
  const [heading = '', ...body] = section.split('\n')
  const routes = [...body.join('\n').matchAll(/\]\((\/playground[^)#?]*)\)/g)].map(([, route]) => route!)
  return [heading.trim(), routes] as const
}))

/** Every page the playground serves: Panels' pages, and the module's where the site mounts them. */
const pages = playgroundRoutes().filter(path => path !== '/playground/offline' && !path.includes(':'))

describe('the Try everything guide', () => {
  it('has a row for every playground page', () => {
    const listed = new Set([...sections.values()].flat())
    expect(pages.length).toBeGreaterThan(20)
    expect(pages.filter(page => !listed.has(page))).toEqual([])
  })

  it('lists each page a layer owns under that layer, and links no page that does not exist', () => {
    for (const layer of Object.values(CAPABILITIES)) {
      expect(sections.has(layer.title), `### ${layer.title}`).toBe(true)
      expect(layer.playground.filter(page => !sections.get(layer.title)!.includes(page)), layer.title).toEqual([])
    }
    expect([...sections.values()].flat().filter(route => !pages.includes(route))).toEqual([])
  })

  it('names every persona the kit seeds, by the address it signs in with', () => {
    const table = text.slice(text.indexOf('## Personas'), text.indexOf('## The checklist'))
    for (const persona of PERSONAS) expect(table, persona.key).toContain(`| ${persona.label} | \`${persona.email}\` |`)
  })

  it('signs each row in as a persona the kit seeds, or as anyone', () => {
    const labels = new Set([...PERSONAS.map(persona => persona.label), 'Anyone', 'Any persona'])
    const rows = checklist.split('\n').filter(line => line.startsWith('| [') || /^\| [^|-][^|]*\| \[/.test(line))
    expect(rows.length).toBeGreaterThan(30)
    for (const row of rows) {
      const as = row.split('|')[3]!.trim()
      for (const who of as.split(/, then | and /)) expect(labels.has(who), `${as} in ${row.slice(0, 60)}`).toBe(true)
    }
  })
})

describe('the guide\'s commands', () => {
  const scripts = Object.keys((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts)

  it('names every flag `pnpm try` takes, and no other', () => {
    for (const flag of TRY_FLAGS) expect(text, flag).toContain(`pnpm try ${flag}`)
    const named = new Set([...text.matchAll(/pnpm try (--[a-z-]+)/g)].map(([, flag]) => flag))
    expect([...named].filter(flag => !TRY_FLAGS.includes(flag!))).toEqual([])
  })

  it('runs only scripts the repository has', () => {
    const commands = new Set([...text.matchAll(/pnpm (try(?::[a-z]+)?)\b/g)].map(([, name]) => name!))
    expect(commands.size).toBeGreaterThanOrEqual(4)
    for (const name of commands) expect(scripts, name).toContain(name)
  })

  it('says where the app, the deployment and the notes are', () => {
    const app = `https://${DEFAULT_NAME}.localhost`
    expect(text).toContain(app)
    expect(text).toContain(siblingOrigin(app, 'api'))
    expect(text).toContain(siblingOrigin(app, 'site'))
    // Without the proxy: the dev server's own default origin.
    expect(text).toContain('PORTLESS=0 pnpm try')
    expect(text).toContain('http://localhost:3000')
    expect(text).toContain(relative(root, NOTES_FILE).split(sep).join('/'))
    expect(text).toContain('pnpm try:notes --out')
  })
})
