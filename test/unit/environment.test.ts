import { afterEach, describe, expect, it, vi } from 'vitest'
import { backendEnvironment as appEnvironment } from '../../src/convex/app'
import { backendEnvironment, logsOtp, undeliverableReason } from '../../src/convex/delivery'
import { BACKEND_ENVIRONMENTS, billingEnvironment, isLive, logsSignInCodes, parseBackendEnvironment, publishesDevInbox, trustsLocalOrigins } from '../../src/convex/environment'
import { devInboxFinding, type ProductionPosture } from '../../src/cli/posture'

// BACKEND_ENVIRONMENT is the one variable that says what kind of deployment
// the backend runs on. Every mode follows from it, so these tests hold each
// value to the table the docs print:
//
//   development  test mode  sandbox     local origins trusted  codes logged
//   preview      test mode  sandbox     no                     no
//   sandbox      test mode  sandbox     no                     no
//   production   live       live        no                     no

describe('BACKEND_ENVIRONMENT', () => {
  it('takes four kinds of deployment', () => {
    expect(BACKEND_ENVIRONMENTS).toEqual(['development', 'preview', 'sandbox', 'production'])
  })

  it.each([
    ['development', false, 'sandbox', true, true],
    ['preview', false, 'sandbox', false, false],
    ['sandbox', false, 'sandbox', false, false],
    ['production', true, 'production', false, false],
  ] as const)('decides every mode at once for %s', (name, live, billing, local, codes) => {
    const environment = parseBackendEnvironment(name)
    expect(isLive(environment)).toBe(live)
    expect(billingEnvironment(environment)).toBe(billing)
    expect(trustsLocalOrigins(environment)).toBe(local)
    expect(logsSignInCodes(environment)).toBe(codes)
  })

  it('reads an unset or unknown value as no kind, which keeps every provider in its test mode and trusts nothing local', () => {
    for (const value of [undefined, null, '', ' ', 'prod', 'Production', 'dev', 'staging', 'true']) {
      const environment = parseBackendEnvironment(value)
      expect(environment, String(value)).toBeUndefined()
      expect(isLive(environment)).toBe(false)
      expect(billingEnvironment(environment)).toBe('sandbox')
      expect(trustsLocalOrigins(environment)).toBe(false)
      expect(logsSignInCodes(environment)).toBe(false)
    }
  })

  it('ignores the whitespace around a value', () => {
    expect(parseBackendEnvironment(' production\n')).toBe('production')
  })
})

describe('the deployment reading it', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reads the variable where the Convex runtime puts it', () => {
    expect(backendEnvironment()).toBeUndefined()
    vi.stubEnv('BACKEND_ENVIRONMENT', 'sandbox')
    expect(backendEnvironment()).toBe('sandbox')
  })

  it('is the one an app reads from nuxt-backend/app, which the package reads too', () => {
    expect(appEnvironment).toBe(backendEnvironment)
    vi.stubEnv('BACKEND_ENVIRONMENT', ' preview ')
    expect(appEnvironment()).toBe('preview')
    vi.stubEnv('BACKEND_ENVIRONMENT', 'staging')
    expect(appEnvironment()).toBeUndefined()
  })

  it('prints sign-in codes on a development deployment alone', () => {
    for (const [value, logs] of [['development', true], ['preview', false], ['sandbox', false], ['production', false], ['1', false], ['', false]] as const) {
      vi.stubEnv('BACKEND_ENVIRONMENT', value)
      expect(logsOtp(), value).toBe(logs)
    }
  })

  it('sends to every address on production only, and to the provider\'s test addresses elsewhere', () => {
    vi.stubEnv('EMAIL_API_KEY', 're_key')
    vi.stubEnv('EMAIL_FROM', 'Acme <hello@acme.dev>')
    for (const value of ['development', 'preview', 'sandbox', '']) {
      vi.stubEnv('BACKEND_ENVIRONMENT', value)
      expect(undeliverableReason('ada@example.com'), value).toBe('test-mode')
      expect(undeliverableReason('delivered+ada@resend.dev'), value).toBeNull()
    }
    vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
    expect(undeliverableReason('ada@example.com')).toBeNull()
  })
})

describe('the dev inbox\'s page reader', () => {
  it('answers only with EMAIL_DEV_INBOX=1 on a deployment that says it is not production', () => {
    expect(['development', 'preview', 'sandbox'].map(kind => publishesDevInbox(parseBackendEnvironment(kind), '1'))).toEqual([true, true, true])
    expect(publishesDevInbox('production', '1')).toBe(false)
    expect(publishesDevInbox(undefined, '1')).toBe(false)
    expect(publishesDevInbox('development', undefined)).toBe(false)
    expect(publishesDevInbox('development', 'true')).toBe(false)
  })
})

describe('doctor on EMAIL_DEV_INBOX', () => {
  const posture = (environment: string) => ({ environment, siteOrigin: 'unset', email: 'unset' }) as unknown as ProductionPosture

  it('passes set outside production', () => {
    expect(devInboxFinding({ prod: false, posture: null })).toMatchObject({ id: 'deployment-email-dev-inbox', status: 'pass' })
    expect(devInboxFinding({ prod: true, posture: posture('sandbox') })).toMatchObject({ status: 'pass', message: expect.stringContaining('on a sandbox deployment') })
  })

  it('warns when it is set with BACKEND_ENVIRONMENT=production, naming the removal', () => {
    expect(devInboxFinding({ prod: true, posture: posture('production') })).toMatchObject({ status: 'warn', fixHint: 'Remove it: npx convex env remove --prod EMAIL_DEV_INBOX' })
    // Production whose kind is unset, or unread, says nothing of a sandbox: it warns too.
    expect(devInboxFinding({ prod: true, posture: posture('unset') }).status).toBe('warn')
  })
})
