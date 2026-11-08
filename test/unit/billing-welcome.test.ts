import { afterEach, describe, expect, it, vi } from 'vitest'
import { PENDING_CREDIT_TTL_MS } from '../../src/convex/constants'
import { backendError } from '../../src/convex/errors'
import type { BillingContext } from '../../src/convex/integrations/billing/context'
import { createWelcomeCredits, welcomeKey } from '../../src/convex/integrations/billing/welcome'
import { sha256Hex } from '../../src/convex/tokens'

// The welcome grant's every outcome, over stand-ins for the provider and the
// cache: who it is claimed for, what it gives, what it leaves alone, what it
// retries (by throwing) and what it only logs. The grant end to end, on the
// fake provider, is test/convex-component/billing-welcome-credits.test.ts.

const WELCOME = { meter: 'credits', units: 8 }
const OWNER = { userId: 'u_1', email: 'Ada.Lovelace+work@Example.com' }

function welcome(options: { grant?: typeof WELCOME | null, token?: string, deleting?: boolean, claimed?: boolean, refund?: () => Promise<boolean>, refresh?: () => Promise<void>, queue?: () => Promise<void>, check?: () => Promise<void> } = {}) {
  const refund = vi.fn(options.refund ?? (async () => true))
  const refreshEntitlements = vi.fn(options.refresh ?? (async () => {}))
  const queueWelcome = vi.fn(options.queue ?? (async () => {}))
  const checkWelcome = vi.fn(options.check ?? (async () => {}))
  const runMutation = vi.fn(async () => options.claimed ?? true)
  const context = {
    catalogIds: options.grant === null ? {} : { welcome: options.grant ?? WELCOME },
    accessToken: 'token' in options ? options.token : 'polar_oat_fake',
    entityDeleting: async () => options.deleting ?? false,
    cache: { claimWelcome: 'ref:claimWelcome' },
  } as unknown as BillingContext
  const ctx = { runMutation } as never
  return { ...createWelcomeCredits(context, { refund }, { refreshEntitlements }, { queueWelcome, checkWelcome }), ctx, refund, refreshEntitlements, queueWelcome, checkWelcome, runMutation }
}

afterEach(() => vi.restoreAllMocks())

describe('queueing the welcome grant', () => {
  it('claims the owner\'s one grant by their address\'s hash, tags and dots out, then queues it', async () => {
    const credits = welcome()
    await credits.queue(credits.ctx, 'ws_1', OWNER)
    expect(credits.runMutation).toHaveBeenCalledWith('ref:claimWelcome', { address: await sha256Hex('adalovelace@example.com'), entityId: 'ws_1' })
    expect(credits.queueWelcome).toHaveBeenCalledWith(credits.ctx, 'ws_1')
  })

  it('queues nothing once another entity of the person holds it, or without a grant in the catalog', async () => {
    const taken = welcome({ claimed: false })
    await taken.queue(taken.ctx, 'ws_2', OWNER)
    expect(taken.queueWelcome).not.toHaveBeenCalled()
    const none = welcome({ grant: null })
    await none.queue(none.ctx, 'ws_1', OWNER)
    expect(none.runMutation).not.toHaveBeenCalled()
  })

  it('never fails the start it follows', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refused = welcome({ queue: () => Promise.reject(new Error('workpool unavailable')) })
    await expect(refused.queue(refused.ctx, 'ws_1', OWNER)).resolves.toBeUndefined()
    expect(error.mock.calls.flat().join('\n')).toContain('billing.welcome_credits_unqueued')
  })
})

describe('the welcome grant', () => {
  it('grants the catalog\'s units keyed by the entity, then checks the balance once the cache\'s window has passed', async () => {
    const credits = welcome()
    expect(await credits.run(credits.ctx, 'ws_1')).toBe('granted')
    expect(credits.refund).toHaveBeenCalledWith(credits.ctx, { userId: 'ws_1', meter: 'credits', value: 8, externalId: 'welcome:ws_1', metadata: { reason: 'welcome' } })
    // No read right away: the provider may not count the event yet.
    expect(credits.refreshEntitlements).not.toHaveBeenCalled()
    expect(credits.checkWelcome).toHaveBeenCalledWith(credits.ctx, 'ws_1', PENDING_CREDIT_TTL_MS + 30_000)
    expect(welcomeKey('ws_1')).toBe('welcome:ws_1')
  })

  it('answers granted_before when the provider held the event already, and still checks', async () => {
    const credits = welcome({ refund: async () => false })
    expect(await credits.run(credits.ctx, 'ws_1')).toBe('granted_before')
    expect(credits.checkWelcome).toHaveBeenCalled()
  })

  it('reads the balance back on the check, and grants nothing more', async () => {
    const credits = welcome()
    expect(await credits.run(credits.ctx, 'ws_1', 'check')).toBe('granted_before')
    expect(credits.refreshEntitlements).toHaveBeenCalledWith(credits.ctx, 'ws_1')
    expect(credits.refund).not.toHaveBeenCalled()
  })

  it('gives nothing without a grant in the catalog, without a token, or to an entity being erased', async () => {
    for (const [options, outcome] of [[{ grant: null }, 'none'], [{ token: undefined }, 'not_configured'], [{ deleting: true }, 'gone']] as const) {
      const credits = welcome(options)
      expect(await credits.run(credits.ctx, 'ws_1')).toBe(outcome)
      expect(credits.refund).not.toHaveBeenCalled()
    }
  })

  it('takes a customer that is gone for an entity that is gone, and is not retried for it', async () => {
    const credits = welcome({ refund: () => Promise.reject(backendError('not_ready', { reason: 'no_customer' })) })
    expect(await credits.run(credits.ctx, 'ws_1')).toBe('gone')
  })

  it('throws any other refusal, for the workpool to retry', async () => {
    const refused = backendError('unavailable', { service: 'billing', reason: 'provider_refused' })
    const credits = welcome({ refund: () => Promise.reject(refused) })
    await expect(credits.run(credits.ctx, 'ws_1')).rejects.toBe(refused)
  })

  it('logs a check it could not schedule or a balance it could not read, and still counts the grant', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unscheduled = welcome({ check: () => Promise.reject(new Error('scheduler down')) })
    expect(await unscheduled.run(unscheduled.ctx, 'ws_1')).toBe('granted')
    const unread = welcome({ refresh: () => Promise.reject(new Error('provider down')) })
    expect(await unread.run(unread.ctx, 'ws_1', 'check')).toBe('granted_before')
    expect(warn.mock.calls.flat().join('\n').match(/billing\.welcome_credits_unsynced/g)).toHaveLength(2)
  })
})
