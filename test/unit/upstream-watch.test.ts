import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Every version Dependabot is told to skip waits on something upstream, and
// the weekly `upstream` job (scripts/check-upstream.mjs) reports when it
// arrives. A hold with no watch would never be lifted.

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')

interface Watch { id: string, title: string, package: string, field: string, dependency: string, version: string, unblocks: string }
const { watches } = JSON.parse(read('.github/upstream.json')) as { watches: Watch[] }
// A hold skips a version range (`versions` or `update-types`). An entry with
// neither ignores a package outright, as the template and the examples do
// for the packages they pin on purpose; those wait on nothing.
const holds = [...read('.github/dependabot.yml').matchAll(/^\s+- dependency-name: '?([^'\s]+)'?\n\s+(?:versions|update-types):/gm)].map(([, name]) => name!)

describe('the upstream watch', () => {
  it('reads the holds', () => {
    expect(holds).toContain('better-auth')
  })

  it.each(holds)('names a watch that lifts the %s hold', (hold) => {
    expect(watches.some(watch => watch.unblocks.includes(` ${hold} `) || watch.unblocks.includes(`${hold} hold`)), hold).toBe(true)
  })

  it.each(watches.map(watch => [watch.id, watch] as const))('%s is complete', (_id, watch) => {
    for (const key of ['title', 'package', 'field', 'dependency', 'version', 'unblocks'] as const) expect(watch[key], key).toBeTruthy()
    expect(['dependencies', 'devDependencies', 'peerDependencies']).toContain(watch.field)
  })
})
