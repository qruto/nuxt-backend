import { describe, expect, it, vi } from 'vitest'
import { differingKeyLine, forwardSandboxKeys } from '../../scripts/try/sandbox.mjs'

// `pnpm try` forwards the root `.env.local`'s sandbox keys to the local
// deployment, and never replaces one the deployment holds: a renewed token
// would otherwise reach it silently, or never. A held key whose value
// differs from the root's is named, with the command that sets the root's,
// and no value is ever returned or printed.

describe('the sandbox keys', () => {
  const keys = { BILLING_ACCESS_TOKEN: 'polar_new', EMAIL_API_KEY: 're_same', AI_GATEWAY_API_KEY: 'vck_1' }

  it('sets the keys the deployment lacks, and names a held one whose value differs, replacing none', async () => {
    const set = vi.fn(async () => {})
    const held: Record<string, string> = { BILLING_ACCESS_TOKEN: 'polar_revoked', EMAIL_API_KEY: 're_same\n' }
    const result = await forwardSandboxKeys(Object.keys(held), { keys, set, get: async (name: string) => held[name]!.trim() })
    expect(result).toEqual({ forwarded: ['AI_GATEWAY_API_KEY'], differing: ['BILLING_ACCESS_TOKEN'] })
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(expect.any(String), 'AI_GATEWAY_API_KEY', 'vck_1')
  })

  it('says nothing of a held key whose value cannot be read', async () => {
    const result = await forwardSandboxKeys(['BILLING_ACCESS_TOKEN'], { keys: { BILLING_ACCESS_TOKEN: 'polar_new' }, set: vi.fn(), get: async () => null })
    expect(result).toEqual({ forwarded: [], differing: [] })
  })

  it('tells how to use the root\'s value without printing it', () => {
    const line = differingKeyLine('BILLING_ACCESS_TOKEN')
    expect(line).toContain('The deployment keeps its own BILLING_ACCESS_TOKEN, which differs from the root .env.local\'s')
    expect(line).toContain('grep \'^BILLING_ACCESS_TOKEN=\' .env.local | cut -d= -f2- | (cd website && npx convex env set BILLING_ACCESS_TOKEN)')
    expect(line).not.toContain('polar_')
  })
})
