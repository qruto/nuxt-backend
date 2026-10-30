import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENV_EXAMPLE } from '../../src/setup'
import { backendEnv } from '../../src/convex/app'
import { BACKEND_ENV, CONTRACT_ENV_NAMES, DERIVED_DEPLOYMENT_ENV, OPTIONAL_DEPLOYMENT_ENV, REMOVED_DEPLOYMENT_ENV, REMOVED_ENV, REQUIRED_DEPLOYMENT_ENV, type BackendEnvName } from '../../src/env-registry'
import { BACKEND_ENV_NAMES, planEnvPush } from '../../src/env-push'
import { capabilityOfEnv, CAPABILITIES } from '../../src/capabilities'

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

  it('derives BACKEND_ENVIRONMENT, an optional name that .env.local never supplies', () => {
    expect([...DERIVED_DEPLOYMENT_ENV]).toEqual(['BACKEND_ENVIRONMENT'])
    for (const name of DERIVED_DEPLOYMENT_ENV) expect(Object.keys(OPTIONAL_DEPLOYMENT_ENV)).toContain(name)
    // The local value is the dev deployment's, so it never reaches another one.
    const planned = planEnvPush({ deployedNames: [], localEnv: { BACKEND_ENVIRONMENT: 'production' }, dev: false, preview: false })
    expect(planned.find(action => action.name === 'BACKEND_ENVIRONMENT')).toMatchObject({ action: 'provision', value: 'production' })
    expect(planEnvPush({ deployedNames: [], localEnv: { BACKEND_ENVIRONMENT: 'production' }, dev: true }).find(action => action.name === 'BACKEND_ENVIRONMENT')).toMatchObject({ value: 'development' })
  })

  it('has no name for a variable 0.2.0 removed: its replacement is the only way to say it', () => {
    expect(Object.keys(REMOVED_ENV)).toEqual(['EMAIL_TEST_MODE', 'BILLING_ENVIRONMENT', 'MONITORING_ENVIRONMENT', 'AUTH_TRUST_LOCAL_ORIGINS', 'NUXT_BACKEND_LOG_OTP', 'NUXT_PUBLIC_BACKEND_SITE_URL', 'BILLING_SIMULATOR_URL', 'NUXT_BACKEND_SIMULATE_MODELS'])
    expect(REMOVED_DEPLOYMENT_ENV).not.toContain('NUXT_PUBLIC_BACKEND_SITE_URL')
    for (const name of Object.keys(REMOVED_ENV)) {
      expect(Object.keys(BACKEND_ENV)).not.toContain(name)
      expect(CONTRACT_ENV_NAMES).not.toContain(name)
      expect(BACKEND_ENV_NAMES).not.toContain(name)
      expect(Object.keys(backendEnv)).not.toContain(name)
      // A leftover in .env.local is never forwarded.
      for (const dev of [true, false]) expect(planEnvPush({ deployedNames: [], localEnv: { [name]: 'x' }, dev }).map(action => action.name)).not.toContain(name)
    }
  })

  it('names the region and the marketing sender, with no finding of their own yet', () => {
    for (const name of ['EMAIL_REGION', 'EMAIL_MARKETING_FROM'] as const) {
      expect(CONTRACT_ENV_NAMES).toContain(name)
      expect(BACKEND_ENV[name].findings).toEqual([])
    }
    const region = (backendEnv as unknown as Record<string, { kind: string, isOptional: string }>).EMAIL_REGION!
    expect(region.isOptional).toBe('optional')
  })

  it('never claims a platform name', () => {
    for (const name of names) expect(name.startsWith('CONVEX_'), name).toBe(false)
  })
})

describe('.env.example', () => {
  /** The `# ── Group ──` headers of the file, in order, and the names under each. */
  const headers: string[] = []
  const groups: Record<string, string[]> = {}
  let group = ''
  for (const line of ENV_EXAMPLE.split('\n')) {
    const header = line.match(/^# ── (.+) ──$/)
    if (header) headers.push(group = header[1]!)
    const name = line.match(/^# ([A-Z][A-Z0-9_]+)=/)
    if (name) (groups[group] ??= []).push(name[1]!)
  }

  it('lists each name the registry marks under its group, and nothing else', () => {
    const expected: Record<string, string[]> = {}
    for (const capability of Object.values(CAPABILITIES)) {
      const listed = (capability.env as readonly (keyof typeof BACKEND_ENV)[]).filter(name => (BACKEND_ENV[name] as { dotenv?: true, devOnly?: true }).dotenv && !(BACKEND_ENV[name] as { devOnly?: true }).devOnly)
      if (listed.length) expected[('dotenvTitle' in capability ? capability.dotenvTitle : undefined) ?? capability.title] = listed
    }
    // The names pushed to dev deployments alone sit in a group of their own.
    expected['Dev only'] = (Object.keys(BACKEND_ENV) as (keyof typeof BACKEND_ENV)[]).filter(name => (BACKEND_ENV[name] as { devOnly?: true }).devOnly)
    expect(groups).toEqual(expected)
  })

  it('groups by purpose, Backend first, and the platform\'s own names last', () => {
    expect(headers).toEqual(['Backend', 'Email', 'Billing', 'AI', 'Protection', 'Monitoring', 'Dev only', 'Platform'])
    // The platform's group names its names and lists none: they are read, never authored.
    expect(groups.Platform).toBeUndefined()
    expect(ENV_EXAMPLE.slice(ENV_EXAMPLE.indexOf('# ── Platform'))).toContain('CONVEX_DEPLOYMENT')
  })

  it('lists no name that is provisioned or derived, and no removed one', () => {
    const listed = Object.values(groups).flat()
    for (const name of ['AUTH_SECRET', 'SITE_URL', 'BACKEND_ENVIRONMENT', ...Object.keys(REMOVED_ENV)]) expect(listed, name).not.toContain(name)
    for (const name of names) {
      if ((BACKEND_ENV[name] as { dotenv?: true }).dotenv) expect(capabilityOfEnv(name), name).toBeDefined()
    }
  })
})

describe('the env names in the docs', () => {
  it('freezes every name in STABILITY.md', () => {
    const stability = read('STABILITY.md')
    const section = stability.slice(stability.indexOf('The environment variables the package reads'), stability.indexOf('## The experimental tier'))
    expect([...section.matchAll(/^- `([A-Z][A-Z0-9_]+)`$/gm)].map(match => match[1])).toEqual([...names].sort())
  })

  // The environment variables page's table is generated from the registry:
  // test/docs/docs-lookups.test.ts holds it to every name.
})
