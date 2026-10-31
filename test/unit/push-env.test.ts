import { describe, expect, it } from 'vitest'
import { arePushKeys } from '../../src/convex/web-push'
import { planEnvPush, pushKeysToGenerate } from '../../src/env-push'

// `env push` and the web push key pair: generated where the deployment has
// none, kept in .env.local for the dev deployment, a pair of its own for
// production, and never replaced once set.

describe('the web push key pair', () => {
  it('is generated for a dev deployment without one, and provisioned with it', async () => {
    const generated = (await pushKeysToGenerate([], {}, { dev: true }))!
    expect(arePushKeys({ publicKey: generated.PUSH_PUBLIC_KEY, privateKey: generated.PUSH_PRIVATE_KEY })).toBe(true)
    const actions = planEnvPush({ deployedNames: ['AUTH_SECRET', 'SITE_URL'], localEnv: {}, dev: true, generated })
    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'PUSH_PUBLIC_KEY', action: 'provision', value: generated.PUSH_PUBLIC_KEY, detail: expect.stringContaining('kept in .env.local') }),
      expect.objectContaining({ name: 'PUSH_PRIVATE_KEY', action: 'provision', value: generated.PUSH_PRIVATE_KEY }),
    ]))
  })

  it('forwards the pair .env.local holds to the dev deployment, and generates none', async () => {
    const local = { PUSH_PUBLIC_KEY: 'BPub', PUSH_PRIVATE_KEY: 'priv' }
    expect(await pushKeysToGenerate([], local, { dev: true })).toBeNull()
    expect(planEnvPush({ deployedNames: [], localEnv: local, dev: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'PUSH_PUBLIC_KEY', action: 'forward', value: 'BPub' }),
    ]))
  })

  it('gives production a pair of its own, never .env.local\'s', async () => {
    const local = { PUSH_PUBLIC_KEY: 'BPub', PUSH_PRIVATE_KEY: 'priv' }
    const generated = (await pushKeysToGenerate([], local, { dev: false }))!
    expect(generated.PUSH_PUBLIC_KEY).not.toBe('BPub')
    const actions = planEnvPush({ deployedNames: [], localEnv: local, dev: false, generated })
    expect(actions.find(action => action.name === 'PUSH_PUBLIC_KEY')).toMatchObject({ action: 'provision', value: generated.PUSH_PUBLIC_KEY, detail: expect.stringContaining('back it up') })
    expect(actions.some(action => action.value === 'BPub' || action.value === 'priv')).toBe(false)
  })

  it('never replaces a pair the deployment has: new keys would orphan every subscribed device', async () => {
    expect(await pushKeysToGenerate(['PUSH_PUBLIC_KEY', 'PUSH_PRIVATE_KEY'], {}, { dev: false })).toBeNull()
    expect(await pushKeysToGenerate(['PUSH_PUBLIC_KEY'], {}, { dev: true })).toBeNull()
    expect(planEnvPush({ deployedNames: ['PUSH_PUBLIC_KEY', 'PUSH_PRIVATE_KEY'], localEnv: {}, dev: false }).find(action => action.name === 'PUSH_PUBLIC_KEY')).toMatchObject({ action: 'skip' })
  })
})
