import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENV_EXAMPLE } from '../../src/cli/main'
import { backendEnv } from '../../src/convex/app'
import { BACKEND_ENV, CONTRACT_ENV_NAMES, DEV_ONLY_DEPLOYMENT_ENV, OPTIONAL_DEPLOYMENT_ENV, REQUIRED_DEPLOYMENT_ENV, type BackendEnvName } from '../../src/env-registry'
import { BACKEND_ENV_NAMES } from '../../src/env-push'

// The env registry against every other list of env names: the deployment's
// contract (backendEnv), the lists the preflight and `env push` use, the
// .env.example `init` writes, STABILITY.md and the env docs page.

const root = fileURLToPath(new URL('../..', import.meta.url))
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const names = Object.keys(BACKEND_ENV) as BackendEnvName[]

describe('the env registry', () => {
  it('declares in backendEnv exactly its contract, in its order', () => {
    expect(Object.keys(backendEnv)).toEqual(CONTRACT_ENV_NAMES)
    expect(BACKEND_ENV_NAMES).toEqual(CONTRACT_ENV_NAMES)
  })

  it('agrees with backendEnv on what a deploy needs', () => {
    const validators = backendEnv as Record<string, { isOptional: 'required' | 'optional' }>
    expect(CONTRACT_ENV_NAMES.filter(name => validators[name]!.isOptional === 'required')).toEqual(REQUIRED_DEPLOYMENT_ENV)
    expect(Object.keys(OPTIONAL_DEPLOYMENT_ENV)).toEqual(CONTRACT_ENV_NAMES.filter(name => validators[name]!.isOptional === 'optional'))
  })

  it('keeps the dev-only names optional', () => {
    for (const name of DEV_ONLY_DEPLOYMENT_ENV) expect(Object.keys(OPTIONAL_DEPLOYMENT_ENV)).toContain(name)
    expect([...DEV_ONLY_DEPLOYMENT_ENV]).toEqual(['AUTH_TRUST_LOCAL_ORIGINS'])
  })

  it('never claims a platform name', () => {
    for (const name of names) expect(name.startsWith('CONVEX_'), name).toBe(false)
  })
})

describe('.env.example', () => {
  /** The names under each `# ── Group ──` header of the file. */
  const groups: Record<string, string[]> = {}
  let group = ''
  for (const line of ENV_EXAMPLE.split('\n')) {
    const header = line.match(/^# ── (.+?) ─+$/)
    if (header) group = header[1]!
    const name = line.match(/^# ([A-Z][A-Z0-9_]+)=/)
    if (name) (groups[group] ??= []).push(name[1]!)
  }

  it('lists each name under its group, and nothing the registry doesn\'t know', () => {
    const expected: Record<string, string[]> = {}
    for (const name of names) {
      const { example } = BACKEND_ENV[name]
      if (example) (expected[example] ??= []).push(name)
    }
    for (const listed of Object.values(groups)) listed.sort()
    for (const listed of Object.values(expected)) listed.sort()
    expect(groups).toEqual(expected)
  })
})

describe('the env names in the docs', () => {
  it('freezes every name in STABILITY.md', () => {
    const stability = read('STABILITY.md')
    const section = stability.slice(stability.indexOf('The environment variables the package reads'), stability.indexOf('## The experimental tier'))
    expect([...section.matchAll(/^- `([A-Z][A-Z0-9_]+)`$/gm)].map(match => match[1])).toEqual([...names].sort())
  })

  it('explains every name on the environment variables page', () => {
    const page = read('website/content/docs/10.reference/05.configuration/3.environment-variables.md')
    for (const name of names) expect(page, name).toContain(`\`${name}\``)
  })
})
