import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { activationFindings } from '../../src/cli/analytics/activation'
import { metricsAccessFindings } from '../../src/cli/billing/metrics'
import { createPolarFake, type PolarFake, routeToFake } from '../fixtures/polar-fake/server'

// doctor's analytics check: the billing token reads the provider's metrics,
// the read the admin console's Revenue view makes, over the fake provider.

const FAKE = 'http://127.0.0.1:4754'

describe('the analytics-metrics finding', () => {
  let fake: PolarFake

  beforeEach(() => {
    fake = createPolarFake({ baseUrl: FAKE })
    vi.stubGlobal('fetch', routeToFake(fake, FAKE))
  })

  afterEach(() => {
    fake.close()
    vi.unstubAllGlobals()
  })

  const check = () => metricsAccessFindings({ accessToken: 'polar_oat_fake', environment: 'sandbox' })

  it('passes when the token reads the metrics', async () => {
    expect(await check()).toEqual([expect.objectContaining({ id: 'analytics-metrics', capability: 'analytics', status: 'pass' })])
  })

  it('says nothing without a token: billing-access reports that', async () => {
    expect(await metricsAccessFindings({ accessToken: undefined, environment: 'sandbox' })).toEqual([])
  })

  it('names the missing metrics:read scope', async () => {
    fake.state.deniedScopes = ['metrics:read']
    const [found] = await check()
    expect(found).toMatchObject({ id: 'analytics-metrics', status: 'warn' })
    expect(found!.message).toContain('metrics:read')
    expect(found!.fixHint).toContain('metrics:read')
  })

  it('warns when the provider does not answer', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const [found] = await check()
    expect(found).toMatchObject({ id: 'analytics-metrics', status: 'warn' })
    expect(found!.message).toContain('did not answer')
  })
})

describe('the analytics-activation finding', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nb-activation-'))
    mkdirSync(join(root, 'backend'))
    writeFileSync(join(root, 'convex.json'), JSON.stringify({ functions: 'backend/' }))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const audit = (options: string) => writeFileSync(join(root, 'backend/audit.ts'), `import { setupAudit } from 'nuxt-backend/audit'\nexport const audit = setupAudit(components, ${options})\n`)

  it('says nothing without a named activation, or without backend/audit.ts', () => {
    expect(activationFindings(root)).toEqual([])
    audit('{ notifications }')
    expect(activationFindings(root)).toEqual([])
  })

  it('warns when no backend file records the kind setupAudit names', () => {
    audit(`{ activation: 'app.strip_published' }`)
    expect(activationFindings(root)).toEqual([expect.objectContaining({ id: 'analytics-activation', capability: 'analytics', status: 'warn' })])
    // A generated file or a test naming it records nothing.
    mkdirSync(join(root, 'backend/_generated'))
    writeFileSync(join(root, 'backend/_generated/api.ts'), `export const kind = 'app.strip_published'\n`)
    writeFileSync(join(root, 'backend/strips.test.ts'), `record({ type: 'app.strip_published' })\n`)
    expect(activationFindings(root)[0]!.status).toBe('warn')
  })

  it('passes once a backend file records it', () => {
    audit(`{ activation: 'app.strip_published' }`)
    writeFileSync(join(root, 'backend/strips.ts'), `await audit.recordBackendEvent(ctx, { type: 'app.strip_published' })\n`)
    expect(activationFindings(root)).toEqual([expect.objectContaining({ id: 'analytics-activation', status: 'pass' })])
  })
})

describe('the analytics-activation finding, in comments', () => {
  it('reads neither the named kind nor its recording from a comment', () => {
    const root = mkdtempSync(join(tmpdir(), 'nb-activation-'))
    mkdirSync(join(root, 'backend'))
    writeFileSync(join(root, 'convex.json'), JSON.stringify({ functions: 'backend/' }))
    writeFileSync(join(root, 'backend/audit.ts'), `// setupAudit(components, { activation: 'app.project_published' })\nexport const audit = setupAudit(components, { notifications })\n`)
    expect(activationFindings(root)).toEqual([])
    writeFileSync(join(root, 'backend/audit.ts'), `export const audit = setupAudit(components, { activation: 'app.strip_published' })\n`)
    writeFileSync(join(root, 'backend/strips.ts'), `// await audit.recordBackendEvent(ctx, { type: 'app.strip_published' })\n`)
    expect(activationFindings(root)[0]!.status).toBe('warn')
    rmSync(root, { recursive: true, force: true })
  })
})
