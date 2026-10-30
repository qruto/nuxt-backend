import { describe, expect, it } from 'vitest'
import { ENV_DEFAULT_NAMES, planEnvDefaults } from '../../src/env-defaults'
import { executeEnvPush, planEnvPush, type EnvPushAction } from '../../src/env-push'

function byName(actions: EnvPushAction[], name: string): EnvPushAction {
  const action = actions.find(a => a.name === name)
  if (!action) throw new Error(`missing action: ${name}`)
  return action
}

describe('planEnvPush', () => {
  it('provisions the required pair and the kind on a bare dev deployment', () => {
    const actions = planEnvPush({ deployedNames: [], localEnv: {}, dev: true })
    expect(byName(actions, 'AUTH_SECRET').action).toBe('provision')
    expect(byName(actions, 'AUTH_SECRET').value?.length).toBeGreaterThanOrEqual(43) // 32 bytes base64
    expect(byName(actions, 'SITE_URL')).toMatchObject({ action: 'provision', value: 'http://localhost:3000' })
    expect(byName(actions, 'BACKEND_ENVIRONMENT')).toMatchObject({ action: 'provision', value: 'development' })
    // Optional vars are reported, never invented.
    expect(byName(actions, 'EMAIL_API_KEY').action).toBe('unset')
    expect(byName(actions, 'BILLING_ACCESS_TOKEN').action).toBe('unset')
  })

  // The dev inbox's page reader is opt-in: a dev deployment gets it on, and
  // nothing ever carries it anywhere else, .env.local included.
  it('turns the dev inbox on for dev deployments alone', () => {
    expect(byName(planEnvPush({ deployedNames: [], localEnv: {}, dev: true }), 'EMAIL_DEV_INBOX')).toMatchObject({ action: 'provision', value: '1' })
    expect(byName(planEnvPush({ deployedNames: ['EMAIL_DEV_INBOX'], localEnv: {}, dev: true }), 'EMAIL_DEV_INBOX').action).toBe('skip')
    expect(byName(planEnvPush({ deployedNames: [], localEnv: { EMAIL_DEV_INBOX: '0' }, dev: true }), 'EMAIL_DEV_INBOX')).toMatchObject({ action: 'forward', value: '0' })
    for (const target of [{ dev: false }, { dev: false, preview: true }]) {
      const action = byName(planEnvPush({ deployedNames: [], localEnv: { EMAIL_DEV_INBOX: '1' }, ...target }), 'EMAIL_DEV_INBOX')
      expect(action).toMatchObject({ action: 'unset' })
      expect(action.value).toBeUndefined()
    }
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

  it('forwards the sender, the marketing sender and the region like any other key', () => {
    const actions = planEnvPush({ deployedNames: [], localEnv: { EMAIL_FROM: 'a@mail.example.com', EMAIL_MARKETING_FROM: 'n@news.example.com', EMAIL_REGION: 'eu-west-1' }, dev: false })
    expect(byName(actions, 'EMAIL_FROM')).toMatchObject({ action: 'forward', value: 'a@mail.example.com' })
    expect(byName(actions, 'EMAIL_MARKETING_FROM')).toMatchObject({ action: 'forward', value: 'n@news.example.com' })
    expect(byName(actions, 'EMAIL_REGION')).toMatchObject({ action: 'forward', value: 'eu-west-1' })
  })

  it('fills MONITORING_DSN from the DSN Sentry\'s Vercel integration sets, and prefers its own', () => {
    expect(byName(planEnvPush({ deployedNames: [], localEnv: { NEXT_PUBLIC_SENTRY_DSN: 'https://a@o.test/1' }, dev: false }), 'MONITORING_DSN')).toMatchObject({ action: 'forward', value: 'https://a@o.test/1' })
    expect(byName(planEnvPush({ deployedNames: [], localEnv: { NEXT_PUBLIC_SENTRY_DSN: 'https://a@o.test/1', MONITORING_DSN: 'https://b@o.test/2' }, dev: false }), 'MONITORING_DSN')).toMatchObject({ value: 'https://b@o.test/2' })
    // The integration's name is a platform name: it is read, never pushed under its own.
    expect(planEnvPush({ deployedNames: [], localEnv: { NEXT_PUBLIC_SENTRY_DSN: 'https://a@o.test/1' }, dev: false }).map(action => action.name)).not.toContain('NEXT_PUBLIC_SENTRY_DSN')
  })

  it('takes SITE_URL from NUXT_SITE_URL, as an origin, when SITE_URL itself is not set', () => {
    expect(byName(planEnvPush({ deployedNames: [], localEnv: { NUXT_SITE_URL: 'https://app.example.com/' }, dev: false }), 'SITE_URL')).toMatchObject({ action: 'forward', value: 'https://app.example.com' })
    expect(byName(planEnvPush({ deployedNames: [], localEnv: { NUXT_SITE_URL: 'https://app.example.com', SITE_URL: 'https://own.example.com' }, dev: false }), 'SITE_URL')).toMatchObject({ value: 'https://own.example.com' })
    expect(byName(planEnvPush({ deployedNames: [], localEnv: { NUXT_SITE_URL: 'https://app.example.test:4000' }, dev: true }), 'SITE_URL')).toMatchObject({ action: 'forward', value: 'https://app.example.test:4000' })
    // The site config's own name is read, never pushed under its own.
    expect(planEnvPush({ deployedNames: [], localEnv: { NUXT_SITE_URL: 'https://app.example.com' }, dev: false }).map(action => action.name)).not.toContain('NUXT_SITE_URL')
  })

  it('sets nothing for a stand-in model: no deployment of any kind gets a marker for one', () => {
    for (const input of [{ dev: true }, { dev: false }, { dev: true, preview: false }, { dev: false, preview: true }]) {
      const names = planEnvPush({ deployedNames: [], localEnv: {}, ...input }).map(action => action.name)
      expect(names, JSON.stringify(input)).not.toContain('NUXT_BACKEND_SIMULATE_MODELS')
    }
  })

  it('never invents values for a production push — required gaps become missing', () => {
    const actions = planEnvPush({ deployedNames: [], localEnv: { EMAIL_API_KEY: 're_1' }, dev: false })
    expect(byName(actions, 'AUTH_SECRET').action).toBe('missing')
    expect(byName(actions, 'SITE_URL').action).toBe('missing')
    expect(byName(actions, 'EMAIL_API_KEY').action).toBe('forward')
    expect(byName(actions, 'BACKEND_ENVIRONMENT')).toMatchObject({ action: 'provision', value: 'production' })
  })

  it('names each deployment\'s environment by its kind, never from .env.local, and keeps one already set', () => {
    // .env.local is the dev deployment's: its value never reaches another kind.
    const localEnv = { BACKEND_ENVIRONMENT: 'sandbox' }
    for (const [input, value] of [[{ dev: true }, 'development'], [{ dev: true, local: true }, 'development'], [{ dev: false, preview: true }, 'preview'], [{ dev: false }, 'production']] as const) {
      expect(byName(planEnvPush({ deployedNames: [], localEnv, ...input }), 'BACKEND_ENVIRONMENT'), JSON.stringify(input)).toMatchObject({ action: 'provision', value })
    }
    // A demo's hand-set sandbox is left alone, and replaced only when forced.
    expect(byName(planEnvPush({ deployedNames: ['BACKEND_ENVIRONMENT'], localEnv, dev: false }), 'BACKEND_ENVIRONMENT').action).toBe('skip')
    expect(byName(planEnvPush({ deployedNames: ['BACKEND_ENVIRONMENT'], localEnv, dev: true, force: new Set(['BACKEND_ENVIRONMENT']) }), 'BACKEND_ENVIRONMENT'))
      .toMatchObject({ action: 'update', value: 'development' })
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
})

describe('a preview deployment', () => {
  // Disposable like dev, so a secret is generated and it is named a preview
  // (mail in test mode, billing in the sandbox); but its SITE_URL is its own
  // origin, which only the caller knows.
  it('generates AUTH_SECRET, names it a preview, and waits for SITE_URL', () => {
    const actions = planEnvPush({ deployedNames: [], localEnv: {}, dev: false, preview: true })
    expect(byName(actions, 'AUTH_SECRET')).toMatchObject({ action: 'provision', detail: 'generated (preview deployment)' })
    expect(byName(actions, 'AUTH_SECRET').value?.length).toBeGreaterThanOrEqual(43)
    expect(byName(actions, 'SITE_URL')).toMatchObject({ action: 'missing', detail: expect.stringContaining('--site-url') })
    // Not `development`: no sign-in codes in a shared deployment's logs, and no loopback trust.
    expect(byName(actions, 'BACKEND_ENVIRONMENT')).toMatchObject({ action: 'provision', value: 'preview' })
  })

  it('takes a given SITE_URL, and keeps what the preview already holds', () => {
    const actions = planEnvPush({ deployedNames: ['AUTH_SECRET', 'BACKEND_ENVIRONMENT'], localEnv: { SITE_URL: 'https://my-branch.example.app' }, dev: false, preview: true })
    expect(byName(actions, 'SITE_URL')).toMatchObject({ action: 'forward', value: 'https://my-branch.example.app' })
    expect(byName(actions, 'AUTH_SECRET').action).toBe('skip')
    expect(byName(actions, 'BACKEND_ENVIRONMENT').action).toBe('skip')
  })
})

describe('planEnvDefaults', () => {
  it('writes the three preview defaults, SITE_URL as given', () => {
    const actions = planEnvDefaults({ type: 'preview', defaultNames: [], siteUrl: 'https://preview.example.com' })
    expect(actions.map(a => [a.name, a.action])).toEqual([
      ['AUTH_SECRET', 'provision'],
      ['SITE_URL', 'provision'],
      ['BACKEND_ENVIRONMENT', 'provision'],
    ])
    expect(byName(actions, 'SITE_URL').value).toBe('https://preview.example.com')
    expect(byName(actions, 'BACKEND_ENVIRONMENT').value).toBe('preview')
  })

  it('never guesses a preview\'s SITE_URL', () => {
    expect(byName(planEnvDefaults({ type: 'preview', defaultNames: [] }), 'SITE_URL')).toMatchObject({ action: 'missing' })
    // One already set needs no new one.
    expect(byName(planEnvDefaults({ type: 'preview', defaultNames: ['SITE_URL'] }), 'SITE_URL').action).toBe('skip')
  })

  it('gives dev the dev server\'s origin', () => {
    expect(byName(planEnvDefaults({ type: 'dev', defaultNames: [] }), 'SITE_URL')).toMatchObject({ action: 'provision', value: 'http://localhost:3000' })
    expect(byName(planEnvDefaults({ type: 'dev', defaultNames: [] }), 'BACKEND_ENVIRONMENT')).toMatchObject({ action: 'provision', value: 'development' })
  })

  it('publishes the dev inbox to pages on new dev deployments, and never on previews', () => {
    expect(byName(planEnvDefaults({ type: 'dev', defaultNames: [] }), 'EMAIL_DEV_INBOX')).toMatchObject({ action: 'provision', value: '1' })
    expect(planEnvDefaults({ type: 'preview', defaultNames: [], siteUrl: 'https://preview.example.com' }).some(action => action.name === 'EMAIL_DEV_INBOX')).toBe(false)
  })

  it('keeps defaults already set unless forced, and replaces SITE_URL when one is given', () => {
    const actions = planEnvDefaults({ type: 'preview', defaultNames: ENV_DEFAULT_NAMES, siteUrl: 'https://next.example.com', force: new Set(['AUTH_SECRET']) })
    expect(byName(actions, 'AUTH_SECRET').action).toBe('update')
    expect(byName(actions, 'SITE_URL')).toMatchObject({ action: 'update', value: 'https://next.example.com' })
    expect(byName(actions, 'BACKEND_ENVIRONMENT').action).toBe('skip')
  })
})
