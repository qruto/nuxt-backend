import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_SECRET_WINDOW_MS, parseAuthSecret } from '../../src/convex/auth-secrets'
import { runRotate, type RotateDeps } from '../../src/cli/rotate'
import type { EmailSyncReport } from '../../src/convex/integrations/email-sync'

// `nuxt-backend env rotate`, with the deployment's env, its component
// functions and the providers replaced: the order of the writes, what each
// one holds, and that no value is ever printed.

const OLD = 'old-secret-from-openssl-rand-base64-32xyz'
const NEW = 'new-secret-from-openssl-rand-base64-32abc'
const NOW = 1_800_000_000_000

let rootDir: string
beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'nb-rotate-'))
  vi.stubEnv('CONVEX_DEPLOY_KEY', '')
})
afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

function deployment(env: Record<string, string>) {
  const writes: Array<[string, string]> = []
  const calls: string[] = []
  const deps: RotateDeps = {
    getEnv: async (_root, name) => env[name] ?? null,
    setEnv: async (_root, name, value) => {
      writes.push([name, value])
      calls.push(`set ${name}`)
      env[name] = value
    },
    runKeys: async (_root, fn) => {
      calls.push(`keys:${fn}`)
      return fn === 'rotate' ? { expired: 1 } : { removed: 1 }
    },
    staleInvites: async (_root, keyVersion) => {
      calls.push(`access:staleInvites ${keyVersion}`)
      return { count: 0, more: false }
    },
    newSecret: () => NEW,
    now: () => NOW,
  }
  const lines: string[] = []
  return { env, writes, calls, deps, lines, print: (line: string) => lines.push(line) }
}

describe('env rotate AUTH_SECRET', () => {
  it('puts the new secret beside the old, then rotates the keys', async () => {
    const d = deployment({ AUTH_SECRET: OLD })
    const { exitCode, output } = await runRotate(rootDir, 'AUTH_SECRET', {}, d.print, d.deps)
    expect(exitCode).toBe(0)
    expect(d.calls).toEqual(['set AUTH_SECRET', 'keys:rotate'])
    expect(parseAuthSecret(d.env.AUTH_SECRET)).toEqual({ current: NEW, previous: [OLD], entries: [{ version: NOW / 1000, value: NEW }, { version: 0, value: OLD }] })
    expect(output).toMatchObject({ name: 'AUTH_SECRET', state: 'rotating', retiresAt: new Date(NOW + AUTH_SECRET_WINDOW_MS).toISOString() })
    expect(d.lines.join('\n')).not.toContain(OLD)
    expect(d.lines.join('\n')).not.toContain(NEW)
  })

  it('refuses a second rotation inside the window, and retires the old secret after it', async () => {
    const rotating = `${NOW / 1000}:${NEW},0:${OLD}`
    const early = deployment({ AUTH_SECRET: rotating })
    expect((await runRotate(rootDir, 'AUTH_SECRET', {}, early.print, early.deps)).exitCode).toBe(1)
    expect(early.writes).toEqual([])
    expect(early.lines.join('\n')).toContain('--retire')

    const later = deployment({ AUTH_SECRET: rotating })
    later.deps.now = () => NOW + AUTH_SECRET_WINDOW_MS
    const { output } = await runRotate(rootDir, 'AUTH_SECRET', {}, later.print, later.deps)
    expect(later.calls).toEqual([`access:staleInvites ${NOW / 1000}`, 'keys:retire', 'set AUTH_SECRET'])
    expect(later.env.AUTH_SECRET).toBe(`${NOW / 1000}:${NEW}`)
    expect(output?.state).toBe('rotated')
  })

  it('retires the old secret at once with --retire, after a leak', async () => {
    const d = deployment({ AUTH_SECRET: OLD })
    await runRotate(rootDir, 'AUTH_SECRET', { retire: true }, d.print, d.deps)
    expect(d.calls).toEqual(['set AUTH_SECRET', 'keys:rotate', `access:staleInvites ${NOW / 1000}`, 'keys:retire', 'set AUTH_SECRET'])
    expect(d.env.AUTH_SECRET).toBe(`${NOW / 1000}:${NEW}`)
  })

  it('warns, before retiring, of the open invite codes still under the old secret', async () => {
    const d = deployment({ AUTH_SECRET: `${NOW / 1000}:${NEW},0:${OLD}` })
    d.deps.staleInvites = async () => ({ count: 3, more: false })
    const { output } = await runRotate(rootDir, 'AUTH_SECRET', { retire: true }, d.print, d.deps)
    expect(output?.steps[0]).toMatchObject({ step: expect.stringContaining('access:staleInvites'), outcome: 'done', note: '3 open' })
    expect(d.lines.join('\n')).toMatch(/Warning: open invite codes or links still hashed under the old AUTH_SECRET: 3\./)

    const failed = deployment({ AUTH_SECRET: OLD })
    failed.deps.staleInvites = async () => {
      throw new Error('no deployment')
    }
    expect((await runRotate(rootDir, 'AUTH_SECRET', { retire: true }, failed.print, failed.deps)).exitCode).toBe(0)
    expect(failed.lines.join('\n')).toContain('could not be counted')
  })

  it('changes nothing on a dry run', async () => {
    const d = deployment({ AUTH_SECRET: OLD })
    const { output } = await runRotate(rootDir, 'AUTH_SECRET', { dryRun: true }, d.print, d.deps)
    expect(d.calls).toEqual([])
    expect(output?.steps.every(step => step.outcome === 'planned')).toBe(true)
  })
})

describe('env rotate BILLING_WEBHOOK_SECRET', () => {
  it('resets it at the provider, writes `new,old`, then the new one alone', async () => {
    const d = deployment({ BILLING_WEBHOOK_SECRET: 'whsec_old' })
    d.deps.resetBillingSecret = async () => ({ secret: 'whsec_new' })
    const { exitCode } = await runRotate(rootDir, 'BILLING_WEBHOOK_SECRET', {}, d.print, d.deps)
    expect(exitCode).toBe(0)
    expect(d.writes).toEqual([['BILLING_WEBHOOK_SECRET', 'whsec_new,whsec_old'], ['BILLING_WEBHOOK_SECRET', 'whsec_new']])
    expect(d.lines.join('\n')).not.toContain('whsec_')
  })

  it('refuses when the provider cannot be reached with a token here', async () => {
    const d = deployment({ BILLING_WEBHOOK_SECRET: 'whsec_old' })
    d.deps.resetBillingSecret = async () => ({ refusal: 'BILLING_ACCESS_TOKEN is not visible here.' })
    expect((await runRotate(rootDir, 'BILLING_WEBHOOK_SECRET', {}, d.print, d.deps)).exitCode).toBe(1)
    expect(d.writes).toEqual([])
  })
})

describe('env rotate EMAIL_WEBHOOK_SECRET', () => {
  it('rotates at the provider through the deployment and stores the new secret', async () => {
    const d = deployment({})
    const asked: unknown[] = []
    d.deps.emailSync = async (_root, options) => {
      asked.push(options)
      return { key: 'full', webhook: { url: 'https://happy-otter-123.convex.site/email/events', action: 'exists', missingEvents: [], changed: 'secret-rotated', secret: 'whsec_resend_new' } } as unknown as EmailSyncReport
    }
    const { exitCode } = await runRotate(rootDir, 'EMAIL_WEBHOOK_SECRET', {}, d.print, d.deps)
    expect(exitCode).toBe(0)
    expect(asked).toEqual([{ prod: false, dryRun: false, rotateWebhookSecret: true }])
    expect(d.writes).toEqual([['EMAIL_WEBHOOK_SECRET', 'whsec_resend_new']])
  })
})

describe('env rotate refusals', () => {
  it('points a secret with steps of its own at them, and refuses an unknown name', async () => {
    const d = deployment({})
    expect((await runRotate(rootDir, 'PROTECTION_PROOF_SECRET', {}, d.print, d.deps)).exitCode).toBe(1)
    expect(d.lines.at(-1)).toContain('new,old')
    expect((await runRotate(rootDir, 'SITE_URL', {}, d.print, d.deps)).exitCode).toBe(1)
  })
})
