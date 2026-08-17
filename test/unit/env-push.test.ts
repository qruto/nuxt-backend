import { describe, expect, it } from 'vitest'
import { executeEnvPush, planEnvPush, type EnvPushAction } from '../../src/env-push'

function byName(actions: EnvPushAction[], name: string): EnvPushAction {
  const action = actions.find(a => a.name === name)
  if (!action) throw new Error(`missing action: ${name}`)
  return action
}

describe('planEnvPush', () => {
  it('provisions the required pair on a bare dev deployment and enables OTP logging', () => {
    const actions = planEnvPush({ deployedNames: [], localEnv: {}, dev: true })
    expect(byName(actions, 'AUTH_SECRET').action).toBe('provision')
    expect(byName(actions, 'AUTH_SECRET').value?.length).toBeGreaterThanOrEqual(43) // 32 bytes base64
    expect(byName(actions, 'SITE_URL')).toMatchObject({ action: 'provision', value: 'http://localhost:3000' })
    expect(byName(actions, 'NUXT_BACKEND_LOG_OTP')).toMatchObject({ action: 'provision', value: '1' })
    // Optional vars are reported, never invented.
    expect(byName(actions, 'EMAIL_API_KEY').action).toBe('unset')
    expect(byName(actions, 'BILLING_ACCESS_TOKEN').action).toBe('unset')
  })

  it('forwards local values and never overwrites deployment values', () => {
    const actions = planEnvPush({
      deployedNames: ['AUTH_SECRET', 'EMAIL_API_KEY'],
      localEnv: { EMAIL_API_KEY: 're_local', BILLING_ACCESS_TOKEN: 'oat_local', SITE_URL: 'http://localhost:4000' },
      dev: true,
    })
    expect(byName(actions, 'AUTH_SECRET').action).toBe('skip')
    expect(byName(actions, 'EMAIL_API_KEY').action).toBe('skip') // deployed wins over local
    expect(byName(actions, 'BILLING_ACCESS_TOKEN')).toMatchObject({ action: 'forward', value: 'oat_local' })
    expect(byName(actions, 'SITE_URL')).toMatchObject({ action: 'forward', value: 'http://localhost:4000' })
  })

  it('does not enable OTP logging once an email key exists anywhere', () => {
    const inputs: Parameters<typeof planEnvPush>[0][] = [
      { deployedNames: ['EMAIL_API_KEY'], localEnv: {}, dev: true },
      { deployedNames: [], localEnv: { EMAIL_API_KEY: 're_1' }, dev: true },
    ]
    for (const input of inputs) {
      const actions = planEnvPush(input)
      expect(actions.find(a => a.name === 'NUXT_BACKEND_LOG_OTP')).toBeUndefined()
    }
  })

  it('never invents values for a production push — required gaps become missing', () => {
    const actions = planEnvPush({ deployedNames: [], localEnv: { EMAIL_API_KEY: 're_1' }, dev: false })
    expect(byName(actions, 'AUTH_SECRET').action).toBe('missing')
    expect(byName(actions, 'SITE_URL').action).toBe('missing')
    expect(byName(actions, 'EMAIL_API_KEY').action).toBe('forward')
    expect(actions.find(a => a.name === 'NUXT_BACKEND_LOG_OTP')).toBeUndefined()
  })
})

describe('executeEnvPush', () => {
  it('sets only forward/provision actions and reports failures per var', async () => {
    const calls: Array<[string, string]> = []
    const results = await executeEnvPush('/tmp/x', [
      { name: 'A', action: 'forward', value: '1', detail: '' },
      { name: 'B', action: 'skip', detail: '' },
      { name: 'C', action: 'provision', value: '2', detail: '' },
      { name: 'D', action: 'missing', detail: '' },
    ], {
      setEnv: async (_root, name, value) => {
        if (name === 'C') throw new Error('boom')
        calls.push([name, value])
      },
    })
    expect(calls).toEqual([['A', '1']])
    expect(results.map(result => result.outcome)).toEqual(['set', 'skipped', 'failed', 'skipped'])
    expect(results[2]?.error).toContain('boom')
  })

  it('plans without executing on dry run', async () => {
    const results = await executeEnvPush('/tmp/x', [
      { name: 'A', action: 'forward', value: '1', detail: '' },
    ], {
      dryRun: true,
      setEnv: async () => {
        throw new Error('must not be called')
      },
    })
    expect(results[0]?.outcome).toBe('planned')
  })
})
