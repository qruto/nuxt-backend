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

  it('forwards the dev-only loopback trust flag to a dev deployment only', () => {
    const localEnv = { AUTH_TRUST_LOCAL_ORIGINS: '1' }
    expect(byName(planEnvPush({ deployedNames: [], localEnv, dev: true }), 'AUTH_TRUST_LOCAL_ORIGINS'))
      .toMatchObject({ action: 'forward', value: '1' })
    // A production push never carries it, even when .env.local has it.
    const prod = byName(planEnvPush({ deployedNames: [], localEnv, dev: false }), 'AUTH_TRUST_LOCAL_ORIGINS')
    expect(prod.action).toBe('unset')
    expect(prod.value).toBeUndefined()
    expect(prod.detail).toContain('dev-only')
    // Unset locally: reported as optional on dev, dev-only on prod — never invented.
    expect(byName(planEnvPush({ deployedNames: [], localEnv: {}, dev: true }), 'AUTH_TRUST_LOCAL_ORIGINS').action).toBe('unset')
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

describe('rotating a value already on the deployment', () => {
  const deployedNames = ['AUTH_SECRET', 'SITE_URL', 'BILLING_ACCESS_TOKEN']
  const localEnv = { AUTH_SECRET: 'a'.repeat(40), SITE_URL: 'https://app.example.com', BILLING_ACCESS_TOKEN: 'fresh-token' }

  it('leaves deployment values alone and says how to replace them', () => {
    const plan = planEnvPush({ deployedNames, localEnv, dev: true })
    const token = plan.find(action => action.name === 'BILLING_ACCESS_TOKEN')!
    expect(token.action).toBe('skip')
    expect(token.detail).toContain('--force')
    expect(token.value).toBeUndefined()
  })

  it('replaces only the named value when forced', () => {
    const plan = planEnvPush({ deployedNames, localEnv, dev: true, force: new Set(['BILLING_ACCESS_TOKEN']) })
    const token = plan.find(action => action.name === 'BILLING_ACCESS_TOKEN')!
    expect(token.action).toBe('update')
    expect(token.value).toBe('fresh-token')
    // Untouched names keep their deployment value.
    expect(plan.find(action => action.name === 'AUTH_SECRET')!.action).toBe('skip')
  })

  it('cannot replace what the local env does not carry', () => {
    const plan = planEnvPush({ deployedNames, localEnv: {}, dev: true, force: new Set(['BILLING_ACCESS_TOKEN']) })
    const token = plan.find(action => action.name === 'BILLING_ACCESS_TOKEN')!
    expect(token.action).toBe('skip')
    expect(token.detail).toContain('no local value')
  })

  it('never forwards a dev-only var to a non-dev deployment, even forced', () => {
    const plan = planEnvPush({
      deployedNames: ['AUTH_TRUST_LOCAL_ORIGINS'],
      localEnv: { AUTH_TRUST_LOCAL_ORIGINS: '1' },
      dev: false,
      force: new Set(['AUTH_TRUST_LOCAL_ORIGINS']),
    })
    expect(plan.find(action => action.name === 'AUTH_TRUST_LOCAL_ORIGINS')!.action).toBe('unset')
  })
})
