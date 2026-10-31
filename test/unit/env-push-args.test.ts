import { describe, expect, it } from 'vitest'
import type { ArgsDef } from 'citty'
import { bareFlags, forceRefusal, parseEnvPushArgs, parseForce } from '../../src/cli/env-push-args'
import { BACKEND_ENV_NAMES } from '../../src/env-push'

const args = {
  prod: { type: 'boolean', default: false },
  preview: { type: 'string' },
  force: { type: 'string' },
  json: { type: 'boolean', default: false },
} satisfies ArgsDef

/** What `env push` would replace, from the raw command line. */
const forced = (...raw: string[]) => parseForce(parseEnvPushArgs(raw, args).force)

describe('env push --force', () => {
  // The docs write a bare `--force` ("never replacing a value already set
  // unless you pass --force"): it used to parse as no list at all, so the
  // push silently replaced nothing.
  // BACKEND_ENVIRONMENT is derived from the deployment's kind: replaced only when named.
  const everyName = new Set(BACKEND_ENV_NAMES.filter(name => name !== 'BACKEND_ENVIRONMENT'))

  it('replaces every name of the contract but the derived environment when bare', () => {
    expect(forced('--force')).toEqual(everyName)
    expect(forced('--force', '--json')).toEqual(everyName)
    expect(parseEnvPushArgs(['--force', '--json'], args).json).toBe(true)
  })

  it('replaces only the names given, case-insensitively', () => {
    expect(forced('--force', 'protection_proof_secret')).toEqual(new Set(['PROTECTION_PROOF_SECRET']))
    expect(forced('--force=AUTH_SECRET,site_url')).toEqual(new Set(['AUTH_SECRET', 'SITE_URL']))
    expect(forced('--force', 'all')).toEqual(everyName)
    expect(forced('--force', 'all,backend_environment')).toEqual(new Set(BACKEND_ENV_NAMES))
    expect(forced('--force', 'BACKEND_ENVIRONMENT')).toEqual(new Set(['BACKEND_ENVIRONMENT']))
  })

  // .env.local holds the dev deployment's values: its SITE_URL and keys must never replace production's wholesale.
  it('refuses every name on production, and takes the names given there', () => {
    const refusal = (...raw: string[]) => forceRefusal(parseEnvPushArgs(raw, args).force, { prod: parseEnvPushArgs(raw, args).prod })
    expect(refusal('--prod', '--force')).toContain('--force BILLING_ACCESS_TOKEN')
    expect(refusal('--prod', '--force', 'all')).not.toBeNull()
    expect(refusal('--prod', '--force', '--json')).not.toBeNull()
    expect(refusal('--prod', '--force', 'BILLING_ACCESS_TOKEN')).toBeNull()
    expect(refusal('--prod')).toBeNull()
    expect(refusal('--force')).toBeNull()
  })

  it('replaces nothing without the flag', () => {
    expect(forced('--prod')).toBeNull()
  })
})

describe('bareFlags', () => {
  it('reads a flag with no value as an empty one, and leaves a valued flag alone', () => {
    expect(bareFlags(['--preview', '--json'], ['--preview'])).toEqual(['--preview=', '--json'])
    expect(bareFlags(['--preview', 'my-branch'], ['--preview'])).toEqual(['--preview', 'my-branch'])
    expect(bareFlags(['--force'], ['--force'])).toEqual(['--force='])
  })

  it('keeps a bare --preview without a name', () => {
    expect(parseEnvPushArgs(['--preview'], args).preview).toBe('')
  })
})
