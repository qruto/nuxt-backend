import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PANEL_TABS } from '../../devtools-client-app/app/nav'
import { DEVTOOLS_PANELS } from '../../src/devtools/rpc-types'
import { BACKEND_ENV } from '../../src/env-registry'
import { finding, FINDING_GROUPS, FINDINGS, type FindingId } from '../../src/findings'
import type { FindingEntries, FindingGroup, PreflightFinding } from '../../src/findings/types'
import { detectCapabilities, capabilityHealth, capabilityOfEnv, capabilityOfGroup, CAPABILITY_NAMES, CAPABILITY_STATE_MEANING, CAPABILITY_STATES, CAPABILITIES, capabilityStatus, capabilitySummary, type CapabilityContext, type CapabilityName, type CapabilityStatus } from '../../src/capabilities'
import { aheadOfCode, contentFile, read } from '../docs/helpers'
import { playgroundRoutes } from '../helpers/playground-routes'

// The capability registry against everything a capability claims: each entry complete,
// and each env name and finding group owned by exactly one capability. Then detection, capability by capability: the state comes from the env and
// the findings doctor already reported, never from an option.

const root = process.cwd()

/** Each finding group's entries, read from its own file of src/findings/. */
const groupFiles = await Promise.all(readdirSync(join(root, 'src/findings'))
  .filter(file => !['index.ts', 'types.ts'].includes(file))
  .map(async file => [file.replace(/\.ts$/, ''), Object.values(await import(`../../src/findings/${file}`) as Record<string, FindingEntries>)[0]!] as const))

/** Every name of a list, and how many capabilities claim it. */
function claims(list: (name: CapabilityName) => readonly string[]): Map<string, CapabilityName[]> {
  const owners = new Map<string, CapabilityName[]>()
  for (const capability of CAPABILITY_NAMES) for (const name of list(capability)) owners.set(name, [...owners.get(name) ?? [], capability])
  return owners
}

describe('each registered capability', () => {
  it.each(CAPABILITY_NAMES)('%s is complete', (name) => {
    const capability = CAPABILITIES[name]
    expect(name).toMatch(/^[a-z]+$/)
    expect(capability.title.length).toBeGreaterThan(1)
    // One line: what it gives the app, as a sentence.
    expect(capability.purpose).toMatch(/^[A-Z][^\n]+\.$/)
    expect(capability.providers.length).toBeGreaterThan(0)
    for (const provider of capability.providers) {
      expect(provider.name.trim()).not.toBe('')
      expect(provider.gives).toMatch(/^[a-z][^\n.]+$/)
    }
    expect(capability.development).toMatch(/^[a-z][^\n.]+$/)
    // Its docs home is a page of the docs site, its tab one the panel has, and
    // its playground pages routes the site serves (Panels' and the module's).
    expect(() => contentFile(capability.docs), capability.docs).not.toThrow()
    expect(DEVTOOLS_PANELS).toContain(capability.devtools)
    expect(capability.playground.length).toBeGreaterThan(0)
    for (const page of capability.playground) expect(playgroundRoutes(), page).toContain(page)
    for (const env of capability.env) expect(Object.keys(BACKEND_ENV)).toContain(env)
    // It detects one of the four states, whatever it is handed.
    const detected = capability.detect({ env: {}, deployed: null, deployment: 'none', findings: [] })
    expect(CAPABILITY_STATES).toContain(detected.state)
    expect(detected.reason).toMatch(/^[\w`]/)
  })

  it('names nothing after a provider: its name and title say what it gives the app', () => {
    const providers = new Set(CAPABILITY_NAMES.flatMap(name => CAPABILITIES[name].providers.map(provider => provider.name.toLowerCase())))
    for (const name of CAPABILITY_NAMES) {
      for (const label of [name, CAPABILITIES[name].title.toLowerCase()]) {
        expect(label).not.toMatch(/convex|polar|resend|better auth|sentry|vercel|mcp toolkit/)
        expect(providers.has(label)).toBe(false)
      }
    }
  })

  it('is listed in console order, the panel\'s tabs are the ones a capability can name', () => {
    expect(CAPABILITY_NAMES).toEqual(['auth', 'data', 'jobs', 'billing', 'email', 'notifications', 'ai', 'protection', 'monitoring', 'flags', 'analytics', 'hosting'])
    expect(PANEL_TABS.map(tab => tab.id)).toEqual([...DEVTOOLS_PANELS])
  })
})

describe('ownership', () => {
  it('gives every env name exactly one capability', () => {
    const owners = claims(name => CAPABILITIES[name].env)
    expect([...owners.keys()].sort()).toEqual(Object.keys(BACKEND_ENV).sort())
    for (const [env, capabilities] of owners) expect(capabilities, env).toHaveLength(1)
    for (const env of Object.keys(BACKEND_ENV)) expect(capabilityOfEnv(env), env).toBe(owners.get(env)![0])
  })

  it('gives every finding group exactly one capability, and every finding exactly one group', () => {
    const owners = claims(name => CAPABILITIES[name].findings)
    expect([...owners.keys()].sort()).toEqual(groupFiles.map(([group]) => group).sort())
    expect([...FINDING_GROUPS].sort()).toEqual([...owners.keys()].sort())
    for (const [group, capabilities] of owners) {
      expect(capabilities, group).toHaveLength(1)
      expect(capabilityOfGroup(group as FindingGroup)).toBe(capabilities[0])
    }
    // No id in two groups: the registry would keep only one of them.
    const ids = groupFiles.flatMap(([, entries]) => Object.keys(entries))
    expect(ids.length).toBe(new Set(ids).size)
    expect(Object.keys(FINDINGS).sort()).toEqual([...ids].sort())
    for (const [group, entries] of groupFiles) {
      for (const id of Object.keys(entries)) expect(FINDINGS[id as FindingId], id).toMatchObject({ group, capability: owners.get(group)![0] })
    }
  })

  it('reports each finding under the capability that owns its group', () => {
    expect(finding('page-paths', 'pass', 'Agreed.').capability).toBe('auth')
    expect(finding('function-contract', 'pass', 'Deployed.').capability).toBe('data')
    expect(finding('backend-site-url', 'pass', 'Configured.').capability).toBe('data')
    expect(finding('agent-files', 'pass', 'Current.').capability).toBe('data')
    expect(finding('agent-docs', 'pass', 'Served.').capability).toBe('hosting')
  })
})

describe('the state of a capability', () => {
  it('is never configured: the module has no option for it', () => {
    const options = read('src/module.ts').slice(read('src/module.ts').indexOf('export interface ModuleOptions'))
    expect(options.slice(0, options.indexOf('\n}\n'))).not.toMatch(/^\s+capabilities\??:/m)
  })

  // The deployment's names read: they decide, whatever is visible here.
  const cloud: CapabilityContext = { env: {}, deployed: new Set(), deployment: 'cloud-dev', findings: [] }
  const with_ = (overrides: Partial<CapabilityContext>, names: string[] = []): CapabilityContext =>
    ({ ...cloud, ...overrides, deployed: new Set([...overrides.deployed ?? [], ...names]) })
  // The deployment's names not read: what is visible here stands in.
  const unread = (env: Record<string, string>, overrides: Partial<CapabilityContext> = {}): CapabilityContext => ({ ...cloud, env, deployed: null, ...overrides })
  const state = (name: CapabilityName, context: CapabilityContext) => CAPABILITIES[name].detect(context).state
  const reason = (name: CapabilityName, context: CapabilityContext) => CAPABILITIES[name].detect(context).reason

  it('runs on the deployment for data and jobs: live on production or a self-hosted one, test on a dev, preview or local one, missing without one', () => {
    for (const name of ['data', 'jobs'] as const) {
      expect(state(name, with_({ deployment: 'cloud-dev' })), name).toBe('test')
      expect(state(name, with_({ deployment: 'preview' })), name).toBe('test')
      expect(state(name, with_({ deployment: 'production' })), name).toBe('live')
      expect(state(name, with_({ deployment: 'self-hosted' })), name).toBe('live')
      expect(state(name, with_({ deployment: 'local' })), name).toBe('test')
      expect(state(name, with_({ deployment: 'anonymous' })), name).toBe('test')
      expect(state(name, with_({ deployment: 'none' })), name).toBe('missing')
    }
    expect(reason('data', with_({}))).toBe('runs on the cloud dev deployment')
  })

  it('reads analytics as the billing it reads: missing without the token, its mode with it, failing on its own finding', () => {
    expect(reason('analytics', with_({}))).toBe('its metrics need billing: BILLING_ACCESS_TOKEN is not set')
    expect(state('analytics', with_({}, ['BILLING_ACCESS_TOKEN']))).toBe('test')
    expect(state('analytics', with_({ switches: { BACKEND_ENVIRONMENT: 'production' } }, ['BILLING_ACCESS_TOKEN', 'BACKEND_ENVIRONMENT']))).toBe('live')
    const scope = finding('analytics-metrics', 'fail', 'Refused.')
    expect(state('analytics', with_({ findings: [scope] }, ['BILLING_ACCESS_TOKEN']))).toBe('failing')
  })

  it('reads email from its key and the deployment\'s BACKEND_ENVIRONMENT, as the deployment has them', () => {
    expect(state('email', with_({}))).toBe('missing')
    expect(state('email', with_({}, ['EMAIL_API_KEY']))).toBe('test')
    // The value read off the deployment decides; any kind but production keeps test mode on.
    const keyed = ['EMAIL_API_KEY', 'BACKEND_ENVIRONMENT']
    expect(state('email', with_({ switches: { BACKEND_ENVIRONMENT: 'production' } }, keyed))).toBe('live')
    for (const environment of ['development', 'preview', 'sandbox']) expect(state('email', with_({ switches: { BACKEND_ENVIRONMENT: environment } }, keyed)), environment).toBe('test')
    expect(reason('email', with_({ switches: { BACKEND_ENVIRONMENT: 'development' } }, keyed))).toBe('BACKEND_ENVIRONMENT is development: only the provider\'s test addresses receive mail')
    // Not read: the value visible here when the deployment has the name too…
    expect(state('email', with_({ env: { BACKEND_ENVIRONMENT: 'production' } }, keyed))).toBe('live')
    expect(state('email', with_({ env: { BACKEND_ENVIRONMENT: 'sandbox' } }, keyed))).toBe('test')
    // …the backend's default when the deployment lacks it, whatever is visible here…
    expect(state('email', with_({ env: { BACKEND_ENVIRONMENT: 'production' } }, ['EMAIL_API_KEY']))).toBe('test')
    // …a value that is none of the four kinds, which the backend reads as unset…
    expect(state('email', with_({ switches: { BACKEND_ENVIRONMENT: 'prod' } }, keyed))).toBe('test')
    // …and test mode, said so, when its value cannot be told.
    expect(CAPABILITIES.email.detect(with_({}, keyed))).toEqual({ state: 'test', reason: 'BACKEND_ENVIRONMENT is set on the deployment and its value was not read: taken as test mode' })
  })

  it('counts a key set here but never pushed as missing, once the deployment\'s names are read', () => {
    expect(CAPABILITIES.email.detect(with_({ env: { EMAIL_API_KEY: 'k', BACKEND_ENVIRONMENT: 'production' } }))).toEqual({ state: 'missing', reason: 'EMAIL_API_KEY is set here but not on the deployment (run env push), so sends no-op' })
    expect(state('auth', with_({ env: { AUTH_SECRET: 's', SITE_URL: 'https://app.example.com' } }))).toBe('missing')
    // Until they are, what is visible here stands in, and so do the names provisioned there.
    expect(state('email', unread({ EMAIL_API_KEY: 'k' }))).toBe('test')
    expect(state('email', unread({ EMAIL_API_KEY: 'k', BACKEND_ENVIRONMENT: 'production' }))).toBe('live')
    expect(state('auth', unread({}, { provisioned: new Set(['AUTH_SECRET', 'SITE_URL']) }))).toBe('test')
  })

  it('reads billing from its token and the environment the deployment sets', () => {
    expect(state('billing', with_({}))).toBe('missing')
    expect(state('billing', with_({}, ['BILLING_ACCESS_TOKEN']))).toBe('test')
    const both = ['BILLING_ACCESS_TOKEN', 'BACKEND_ENVIRONMENT']
    expect(state('billing', with_({ switches: { BACKEND_ENVIRONMENT: 'production' } }, both))).toBe('live')
    // A sandbox demo on production's deployment kind: not live.
    expect(state('billing', with_({ deployment: 'production', switches: { BACKEND_ENVIRONMENT: 'sandbox' } }, both))).toBe('test')
    // Its value not read: the sandbox, said so, never live from the name alone.
    expect(CAPABILITIES.billing.detect(with_({ deployment: 'production' }, both))).toEqual({ state: 'test', reason: 'BACKEND_ENVIRONMENT is set on the deployment and its value was not read: taken as the sandbox' })
    expect(state('billing', unread({ BILLING_ACCESS_TOKEN: 't', BACKEND_ENVIRONMENT: 'sandbox' }))).toBe('test')
    expect(state('billing', unread({ BILLING_ACCESS_TOKEN: 't', BACKEND_ENVIRONMENT: 'production' }))).toBe('live')
  })

  it('makes auth missing without its required pair, then as live as the email that carries its codes', () => {
    expect(state('auth', with_({}))).toBe('missing')
    expect(reason('auth', with_({}))).toBe('AUTH_SECRET and SITE_URL are not set')
    expect(reason('auth', with_({}, ['AUTH_SECRET']))).toBe('SITE_URL is not set')
    expect(state('auth', with_({}, ['AUTH_SECRET', 'SITE_URL']))).toBe('test')
    expect(state('auth', with_({ switches: { BACKEND_ENVIRONMENT: 'production' } }, ['AUTH_SECRET', 'SITE_URL', 'EMAIL_API_KEY', 'BACKEND_ENVIRONMENT']))).toBe('live')
  })

  it('makes ai as real as the billing its credits come from', () => {
    expect(state('ai', with_({}))).toBe('missing')
    expect(reason('ai', with_({}))).toBe('its credits need billing: BILLING_ACCESS_TOKEN is not set')
    expect(state('ai', unread({ BILLING_ACCESS_TOKEN: 't' }))).toBe('test')
    expect(state('ai', unread({ BILLING_ACCESS_TOKEN: 't', BACKEND_ENVIRONMENT: 'production' }))).toBe('live')
    expect(state('ai', with_({ deployment: 'production', switches: { BACKEND_ENVIRONMENT: 'sandbox' } }, ['BILLING_ACCESS_TOKEN', 'BACKEND_ENVIRONMENT']))).toBe('test')
  })

  it('reads protection as test mode outside production, where the dev server\'s check answers human, whatever is set', () => {
    expect(CAPABILITIES.protection.detect(with_({ deployment: 'local' }))).toMatchObject({ state: 'test', reason: expect.stringContaining('test mode') })
    expect(state('protection', with_({ deployment: 'anonymous' }, ['PROTECTION_PROOF_SECRET']))).toBe('test')
    // A cloud dev deployment too: the dev server signs a proof for every request.
    expect(CAPABILITIES.protection.detect(with_({}))).toEqual({ state: 'test', reason: 'test mode: the dev server\'s bot check answers human, as BotID does in development' })
    expect(reason('protection', with_({}, ['PROTECTION_PROOF_SECRET']))).toContain('the deployment takes proofs')
    expect(state('protection', with_({ env: { NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY: '1x00000000000000000000AA' } }, ['PROTECTION_CHALLENGE_SECRET_KEY']))).toBe('test')
    // A real challenge alone checks people on the dev server too.
    expect(state('protection', with_({ env: { NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY: '0x4AAAAAAAexample' } }, ['PROTECTION_CHALLENGE_SECRET_KEY']))).toBe('live')
    expect(state('protection', with_({ env: { NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY: '0x4AAAAAAAexample' } }, ['PROTECTION_CHALLENGE_SECRET_KEY', 'PROTECTION_PROOF_SECRET']))).toBe('test')
    // No deployment, nothing to check with.
    expect(state('protection', with_({ deployment: 'none' }))).toBe('missing')
  })

  it('reads production\'s protection from what its deployment checks: missing with neither secret', () => {
    const production = (names: string[] | null, env: Record<string, string> = {}): CapabilityContext => ({ ...cloud, env, deployment: 'production', prod: true, deployed: names && new Set(names) })
    expect(CAPABILITIES.protection.detect(production([]))).toEqual({ state: 'missing', reason: 'neither PROTECTION_PROOF_SECRET nor PROTECTION_CHALLENGE_SECRET_KEY is set, so nothing checks for bots' })
    expect(state('protection', production(['PROTECTION_PROOF_SECRET']))).toBe('live')
    expect(state('protection', production(['PROTECTION_CHALLENGE_SECRET_KEY']))).toBe('live')
    expect(reason('protection', production(['PROTECTION_PROOF_SECRET', 'PROTECTION_CHALLENGE_SECRET_KEY']))).toContain('or a challenge answer')
    // Only its names count, none when they cannot be read: a secret visible here was never pushed there.
    expect(CAPABILITIES.protection.detect(production(null, { PROTECTION_PROOF_SECRET: 's' }))).toEqual({ state: 'missing', reason: 'production\'s env names could not be read' })
    // A dev server pointed at the production deployment reads it as production does.
    expect(state('protection', with_({ deployment: 'production' }))).toBe('missing')
  })

  it('lists the protection secrets as missing only once doctor flags them: either one protects', () => {
    const quiet = capabilityStatus('protection', with_({}))
    expect(quiet.missingEnv).toEqual([])
    const flagged = capabilityStatus('protection', with_({ findings: [finding('bot-protection', 'warn', 'No bot protection is live on production.')] }))
    expect(flagged.missingEnv).toEqual(['PROTECTION_PROOF_SECRET', 'PROTECTION_CHALLENGE_SECRET_KEY'])
  })

  it('makes monitoring live once a DSN reports for the app or the backend, and the local log its stand-in in dev', () => {
    // The backend's DSN, read off the deployment; the app's, as the caller tells it: the SDK wired with a DSN.
    expect(CAPABILITIES.monitoring.detect(with_({ app: { monitoring: true } }, ['MONITORING_DSN']))).toEqual({ state: 'live', reason: 'the app and the backend report errors' })
    expect(CAPABILITIES.monitoring.detect(with_({ app: { monitoring: true } }))).toEqual({ state: 'live', reason: 'the app reports errors; the backend does not: MONITORING_DSN is not set' })
    expect(CAPABILITIES.monitoring.detect(with_({}, ['MONITORING_DSN']))).toMatchObject({ state: 'live', reason: expect.stringContaining('no error-reporting SDK is wired') })
    // A DSN in the env with no SDK to report through counts for nothing.
    expect(state('monitoring', with_({ env: { MONITORING_DSN: 'd', NEXT_PUBLIC_SENTRY_DSN: 'd' }, deployment: 'production' }))).toBe('missing')
    // None: the dev server's local error log on a dev deployment, nothing on production.
    for (const deployment of ['local', 'anonymous', 'cloud-dev'] as const) expect(state('monitoring', with_({ deployment })), deployment).toBe('test')
    expect(CAPABILITIES.monitoring.detect(with_({ deployment: 'production' }))).toEqual({ state: 'missing', reason: 'MONITORING_DSN is not set, so errors go unreported' })
    // Under production posture the app's env here is not production's; what the app says of itself (the health route) wins.
    expect(state('monitoring', with_({ env: { NEXT_PUBLIC_SENTRY_DSN: 'd' }, deployment: 'production', prod: true }))).toBe('missing')
    expect(state('monitoring', with_({ deployment: 'production', app: { monitoring: true } }))).toBe('live')
    expect(state('monitoring', with_({ env: { NEXT_PUBLIC_SENTRY_DSN: 'd' }, app: { monitoring: false } }))).toBe('test')
  })

  it('keeps flags live wherever the app runs: nothing to configure, and no stand-in', () => {
    for (const deployment of ['none', 'local', 'anonymous', 'cloud-dev', 'production'] as const) {
      expect(state('flags', with_({ deployment })), deployment).toBe('live')
      expect(state('flags', with_({ deployment, prod: true })), deployment).toBe('live')
    }
    expect(CAPABILITIES.flags.env).toEqual([])
    expect(capabilityStatus('flags', with_({})).missingEnv).toEqual([])
  })

  it('fails a capability when one of its own findings fails, and no other', () => {
    const route = finding('billing-webhook-route', 'fail', '/billing/events is not mounted on the deployment.')
    const context = unread({ BILLING_ACCESS_TOKEN: 't', BACKEND_ENVIRONMENT: 'production' }, { findings: [route] })
    expect(CAPABILITIES.billing.detect(context)).toEqual({ state: 'failing', reason: 'Billing webhook route failed' })
    // ai spends billing's credits, but a route of billing's is not one of its checks.
    expect(state('ai', context)).toBe('live')
    expect(state('email', with_({ findings: [route] }))).toBe('missing')
    expect(state('billing', unread({ BILLING_ACCESS_TOKEN: 't' }, { findings: [{ ...route, status: 'warn' }] }))).toBe('test')
  })

  it('counts only the deployment under production posture, and nothing when its names cannot be read', () => {
    const local = { EMAIL_API_KEY: 'k', BACKEND_ENVIRONMENT: 'production', BILLING_ACCESS_TOKEN: 't', AUTH_SECRET: 's', SITE_URL: 'https://app.example.com' }
    const prod = with_({ env: local, deployment: 'production', prod: true }, ['AUTH_SECRET', 'SITE_URL'])
    expect(CAPABILITIES.email.detect(prod)).toEqual({ state: 'missing', reason: 'EMAIL_API_KEY is not set on the production deployment, so sends no-op' })
    expect(state('billing', prod)).toBe('missing')
    // The environment production sets counts by the value read off it, never by the dev env's.
    const keys = ['AUTH_SECRET', 'SITE_URL', 'EMAIL_API_KEY', 'BACKEND_ENVIRONMENT']
    expect(state('email', with_({ env: local, deployment: 'production', prod: true }, keys))).toBe('test')
    expect(state('email', with_({ env: local, deployment: 'production', prod: true, switches: { BACKEND_ENVIRONMENT: 'production' } }, keys))).toBe('live')
    // Its names unreadable: the dev env visible here is not production's, so nothing counts.
    const unreadable = { ...prod, deployed: null }
    for (const name of ['auth', 'email', 'billing', 'ai'] as const) {
      expect(CAPABILITIES[name].detect(unreadable), name).toMatchObject({ state: 'missing', reason: expect.stringContaining('production\'s env names could not be read') })
    }
  })
})

describe('a capability\'s status', () => {
  const findings: PreflightFinding[] = [
    finding('billing-access', 'pass', 'BILLING_ACCESS_TOKEN visible — billing is on.'),
    finding('billing-webhook-secret', 'warn', 'BILLING_WEBHOOK_SECRET is not set.', 'Run billing sync.'),
    finding('billing-portal', 'warn', 'Plan changes are off.'),
    finding('email-transport', 'fail', 'No key.'),
  ]
  const context: CapabilityContext = { env: {}, deployed: new Set(['AUTH_SECRET', 'SITE_URL', 'BILLING_ACCESS_TOKEN']), deployment: 'local', findings }

  it('lists the env it lacks, its tally and its first warning when nothing fails', () => {
    const billing = capabilityStatus('billing', context)
    expect(billing).toMatchObject({
      name: 'billing',
      title: 'Billing',
      state: 'test',
      providers: ['Polar'],
      missingEnv: ['BILLING_WEBHOOK_SECRET'],
      findings: { pass: 1, warn: 2, fail: 0 },
      docsUrl: 'https://nuxt-backend.dev/docs/build/billing',
      devtools: 'billing',
    })
    expect(billing.top).toMatchObject({ id: 'billing-webhook-secret', status: 'warn', fixHint: 'Run billing sync.' })
  })

  it('puts a failure first, and leaves out the names that are derived', () => {
    expect(capabilityStatus('email', context).top?.id).toBe('email-transport')
    // The backend URL derives, and BACKEND_ENVIRONMENT is derived by env push.
    expect(capabilityStatus('auth', context).missingEnv).toEqual([])
    expect(capabilityStatus('data', { ...context, deployed: new Set() }).missingEnv).toEqual([])
    expect(capabilityStatus('jobs', context).top).toBeNull()
  })

  it('leaves out the environment unset, which keeps its safe mode, except for production', () => {
    // The marketing sender and the region have no finding yet, so they are never counted.
    expect(capabilityStatus('email', context).missingEnv).toEqual(['EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_WEBHOOK_SECRET'])
    expect(capabilityStatus('data', context).missingEnv).toEqual([])
    expect(capabilityStatus('billing', { ...context, prod: true }).missingEnv).toEqual(['BILLING_WEBHOOK_SECRET'])
    expect(capabilityStatus('data', { ...context, prod: true }).missingEnv).toEqual(['BACKEND_ENVIRONMENT'])
  })

  it('covers every capability, in console order', () => {
    expect(detectCapabilities(context).map(capability => capability.name)).toEqual(CAPABILITY_NAMES)
  })
})

describe('capabilityHealth', () => {
  const statuses = (states: Partial<Record<CapabilityName, CapabilityStatus['state']>>): CapabilityStatus[] =>
    detectCapabilities({ env: {}, deployed: null, deployment: 'cloud-dev', findings: [] }).map(capability => ({ ...capability, state: states[capability.name] ?? 'live' }))

  it('counts the states in console order, the empty ones left out', () => {
    expect(capabilitySummary(['missing', 'live', 'failing', 'live'])).toBe('2 live · 1 missing · 1 failing')
  })

  it('sums the capabilities up: ok while each is live or test, degraded once one is missing, failing once one fails', () => {
    expect(capabilityHealth(statuses({ data: 'test' })).status).toBe('ok')
    expect(capabilityHealth(statuses({ billing: 'missing' })).status).toBe('degraded')
    expect(capabilityHealth(statuses({ billing: 'missing', email: 'failing' })).status).toBe('failing')
  })

  it('shows the public nothing but the states', () => {
    const coarse = capabilityHealth(detectCapabilities({ env: {}, deployed: null, deployment: 'none', findings: [finding('email-transport', 'warn', 'EMAIL_API_KEY is not set.')] }))
    expect(Object.keys(coarse).sort()).toEqual(['capabilities', 'status'])
    expect(Object.keys(coarse.capabilities)).toEqual(CAPABILITY_NAMES)
    const text = JSON.stringify(coarse)
    for (const name of Object.keys(BACKEND_ENV)) expect(text).not.toContain(name)
    expect(text).not.toContain('email-transport')
  })

  it('adds why, the unset env and the top finding for an admin', () => {
    const detail = capabilityHealth(detectCapabilities({ env: {}, deployed: null, deployment: 'none', findings: [finding('email-transport', 'warn', 'EMAIL_API_KEY is not set.')] }), { detail: true })
    expect(detail.detail.email).toEqual({ reason: 'EMAIL_API_KEY is not set, so sends no-op', missingEnv: ['EMAIL_API_KEY', 'EMAIL_FROM', 'EMAIL_WEBHOOK_SECRET'], top: 'email-transport' })
  })
})

describe('the capabilities in the docs', () => {
  // A page ahead of the code (`status: planned` or `changing`,
  // website/shared/planned.ts) describes the capabilities its unit brings, not
  // the registry's of today: these pins skip it until the unit lands.
  const pinned = (route: string) => !aheadOfCode(contentFile(route))

  it('names every capability on the concept page', () => {
    if (!pinned('/docs/start/concepts/capabilities')) return
    const page = read(contentFile('/docs/start/concepts/capabilities'))
    for (const name of CAPABILITY_NAMES) expect(page, name).toContain(`\`${name}\``)
  })

  it('says what each state means, and its light, in the registry\'s words wherever the docs list them', () => {
    const rows = CAPABILITY_STATES.map(state => `| \`${state}\` | ${CAPABILITY_STATE_MEANING[state].light} | ${CAPABILITY_STATE_MEANING[state].means} |`)
    for (const page of ['/docs/start/concepts/capabilities', '/docs/reference/capabilities'].filter(pinned)) {
      for (const row of rows) expect(read(contentFile(page)), page).toContain(row)
    }
    const lights = CAPABILITY_STATES.map(state => CAPABILITY_STATE_MEANING[state].light)
    if (pinned('/docs/reference/cli')) expect(read(contentFile('/docs/reference/cli'))).toContain(`in ${lights.slice(0, -1).join(', ')} and ${lights.at(-1)} on a terminal`)
    if (pinned('/docs/develop/devtools')) expect(read(contentFile('/docs/develop/devtools'))).toContain(CAPABILITY_STATES.map(state => `${CAPABILITY_STATE_MEANING[state].light} ${state}`).join(', '))
  })
})
