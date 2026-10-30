/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import resendComponent from '@convex-dev/resend/test'
import { componentsGeneric, defineSchema, defineTable, makeFunctionReference, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import component, { asUser, defineBackendTestApp, seedWorkspace } from '../../src/convex/test'
import { api } from '../../src/convex/components/backend/_generated/api'
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'
import schema from '../../src/convex/components/backend/schema'
import { ACCOUNT_DATA_SOURCES, NO_PERSONAL_DATA } from '../../src/convex/account-data'
import { ACCOUNT_EXPORT_LINK_MS, ACCOUNT_EXPORTS_PER_DAY, ERASURE_ATTEMPTS, ERASURE_PARTICIPANTS } from '../../src/convex/components/backend/account'
import { getBackendError } from '../../src/convex/errors'
import { setupAccount } from '../../src/convex/integrations/account'
import { setupAudit } from '../../src/convex/integrations/audit'
import { addressDigest } from '../../src/convex/waitlist-rules'
import { unzipSync } from 'fflate'

// Export and complete erasure. First the component on its own: the erasure
// sweep seeds a person in every table that holds anything of one, erases
// them, and then reads every table of the component for their id and their
// address; then the export's file and its link. Then the app's half, as
// `backend/account.ts` builds it: the export a person makes, the providers'
// and the app's own part of an erasure with its retries, and an erasure by
// address for someone without an account. The auth layer's part (the
// deletion route, the typed confirmation, the only-owner refusal) runs on
// Better Auth's routes in test/unit/account-erasure-flow.test.ts.

const GONE = 'gone@example.com'

describe('the erasure sweep', () => {
  let root: ReturnType<typeof convexTest>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    root = convexTest(schema, component.modules)
    resendComponent.register(root, 'resend')
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** A person in every participant's table, beside someone who stays: what the erasure must and must not touch. */
  async function seed() {
    return root.run(async (ctx) => {
      const now = Date.now()
      const user = (email: string, name: string) => ctx.db.insert('user', { name, email, emailVerified: true, createdAt: now, updatedAt: now, role: 'user', locale: 'de' })
      const gone = await user(GONE, 'Gone')
      const stays = await user('stays@example.com', 'Stays')
      const personal = await ctx.db.insert('organization', { name: 'Gone\'s workspace', slug: `personal-${gone.toLowerCase()}`, createdAt: now })
      const solo = await ctx.db.insert('organization', { name: 'Side project', slug: 'side-project', createdAt: now })
      const shared = await ctx.db.insert('organization', { name: 'Acme', slug: 'acme', createdAt: now })
      for (const [organizationId, userId, role] of [[personal, gone, 'owner'], [solo, gone, 'owner'], [shared, gone, 'admin'], [shared, stays, 'owner']] as const) {
        await ctx.db.insert('member', { organizationId, userId, role, createdAt: now })
      }
      for (const userId of [gone, stays]) {
        await ctx.db.insert('session', { userId, token: `token-${userId}`, createdAt: now, updatedAt: now, expiresAt: now + 86_400_000, ipAddress: '203.0.113.7', userAgent: 'Firefox' })
        await ctx.db.insert('account', { userId, accountId: userId, providerId: 'email-otp', createdAt: now, updatedAt: now })
        await ctx.db.insert('passkey', { userId, name: 'Laptop', publicKey: 'key', credentialID: `credential-${userId}`, counter: 0, deviceType: 'singleDevice', backedUp: false })
      }
      await ctx.db.insert('verification', { identifier: `sign-in-otp-${GONE}`, value: 'hash', expiresAt: now + 600_000, createdAt: now, updatedAt: now })
      await ctx.db.insert('verification', { identifier: 'sign-in-otp-stays@example.com', value: 'hash', expiresAt: now + 600_000, createdAt: now, updatedAt: now })
      // An email change it started, its code keyed by both addresses.
      await ctx.db.insert('verification', { identifier: `change-email-otp-${GONE}-new@example.com`, value: 'hash:0', expiresAt: now + 600_000, createdAt: now, updatedAt: now })
      await ctx.db.insert('invitation', { organizationId: shared, email: 'friend@example.com', role: 'member', status: 'pending', expiresAt: now + 86_400_000, createdAt: now, inviterId: gone })
      await ctx.db.insert('invitation', { organizationId: shared, email: GONE, role: 'member', status: 'accepted', expiresAt: now, createdAt: now, inviterId: stays })
      await ctx.db.insert('invitation', { organizationId: shared, email: 'next@example.com', role: 'member', status: 'pending', expiresAt: now + 86_400_000, createdAt: now, inviterId: stays })
      for (const entityId of [personal, solo, gone, shared]) {
        await ctx.db.insert('billingEntitlements', { userId: entityId, customerId: `cus-${entityId}`, activeProductIds: [], benefits: [], meters: [], updatedAt: now })
      }
      await ctx.db.insert('billingSubscriptionChanges', { subscriptionId: 'sub_1', userId: personal, pendingChange: null, resumesAt: null, modifiedAt: now })
      await ctx.db.insert('billingDiscountAttempts', { userId: personal, refused: 1, windowStart: now })
      await ctx.db.insert('billingQuotaKeys', { userId: personal, key: 'projects' })
      await ctx.db.insert('billingTrials', { ownerUserId: gone, entityId: personal, used: true, at: now })
      const bought = await ctx.db.insert('billingGifts', { recipientEmail: 'friend@example.com', purchaserUserId: gone, purchaserEmail: GONE, purchaserName: 'Gone', productIds: ['p'], message: 'For you', status: 'paid', purchaserEntityId: personal, createdAt: now })
      const received = await ctx.db.insert('billingGifts', { recipientEmail: GONE, purchaserUserId: stays, purchaserEmail: 'stays@example.com', purchaserName: 'Stays', productIds: ['p'], message: 'Enjoy', status: 'claimed', claimingUserId: gone, claimedByUserId: gone, claimedEntityId: personal, createdAt: now })
      await ctx.db.insert('aiRequests', { streamId: 's1', name: 'chat', entityId: personal, userId: gone, args: '{"prompt":"hi"}', cost: 1, externalId: 'x', status: 'reserved', createdAt: now })
      for (const userId of [gone, stays]) {
        await ctx.db.insert('knownDevices', { userId, fingerprint: `fp-${userId}`, device: 'kind', browser: 'Firefox', os: 'Linux', firstSeenAt: now, lastSeenAt: now, alertedAt: now, sessionId: `session-${userId}` })
      }
      await ctx.db.insert('suppressions', { email: GONE, origin: 'bounce', suppressedAt: now, changedAt: now })
      await ctx.db.insert('suppressions', { email: 'stays@example.com', origin: 'complaint', suppressedAt: now, changedAt: now })
      // What its AI calls cost: billed to itself (`billTo: 'user'`), to a workspace that goes and to one that stays, a job its workspace ran with no member, and a chat the app pays for.
      const costs = { day: 0, usd: 0.01, input: 10, output: 10, cached: 0, runs: 1 }
      await ctx.db.insert('aiCosts', { ...costs, who: gone, owner: gone })
      await ctx.db.insert('aiCosts', { ...costs, day: 86_400_000, who: gone, owner: personal })
      await ctx.db.insert('aiCosts', { ...costs, day: 172_800_000, who: gone, owner: shared })
      await ctx.db.insert('aiCosts', { ...costs, who: personal, owner: personal })
      await ctx.db.insert('aiCosts', { ...costs, day: 259_200_000, who: gone, owner: 'app' })
      // The proofs of a renewal's consent and of a withdrawal: the account's, billed to itself and to its workspace, and one its workspace's checkout kept with no account.
      const consent = { productId: 'p', amount: 900, currency: 'usd', interval: 'month', intervalCount: 1, createdAt: now, consentedAt: now }
      await ctx.db.insert('billingRenewalConsents', { ...consent, checkoutId: 'co_1', entityId: gone, userId: gone })
      await ctx.db.insert('billingRenewalConsents', { ...consent, checkoutId: 'co_2', entityId: personal })
      await ctx.db.insert('billingWithdrawals', { entityId: personal, subscriptionId: 'sub_1', userId: gone, productId: 'p', at: now })
      await ctx.db.insert('auditEvents', { type: 'auth.signed_in', actorId: gone, subjectId: gone, at: now })
      await ctx.db.insert('auditEvents', { type: 'workspace.member_removed', actorId: gone, subjectId: stays, entityId: shared, at: now })
      await ctx.db.insert('auditEvents', { type: 'billing.order_paid', entityId: solo, data: { amount: 900, currency: 'usd' }, at: now })
      // Its inbox, and a notification it caused in someone else's.
      await ctx.db.insert('notifications', { userId: gone, type: 'billing.credits_low', eventId: 'evt1', entityId: solo, channels: ['app'], at: now })
      await ctx.db.insert('notifications', { userId: stays, type: 'workspace.member_removed', eventId: 'evt2', actorId: gone, entityId: shared, channels: ['app'], at: now })
      await ctx.db.insert('flagOverrides', { key: 'newEditor', override: { users: [gone, stays] }, updatedAt: now })
      // The ledger: rows of the account, a row kept by a hash of its address, and another person's.
      await ctx.db.insert('consents', { userId: gone, kind: 'terms', version: '2026-10-01', granted: true, at: now, source: 'sign-up' })
      await ctx.db.insert('consents', { emailHash: await addressDigest(GONE), kind: 'launch-news', version: 'waitlist', granted: true, at: now, source: 'waitlist' })
      await ctx.db.insert('consents', { userId: stays, kind: 'terms', version: '2026-10-01', granted: true, at: now, source: 'sign-up' })
      // What it sent through the contact form and by email to the app, a stranger's message, and the reply addresses made for it.
      await ctx.db.insert('contactMessages', { ref: 'aaaaaaaaaaaa', userId: gone, name: 'Gone', email: GONE, message: 'Please delete my gallery.', sentAt: now, delivery: 'support' })
      await ctx.db.insert('contactMessages', { ref: 'bbbbbbbbbbbb', name: 'Gone', email: GONE, message: 'A message sent before it had an account.', sentAt: now, delivery: 'kept' })
      await ctx.db.insert('contactMessages', { ref: 'cccccccccccc', userId: stays, name: 'Stays', email: 'stays@example.com', message: 'Another person writes in.', sentAt: now, delivery: 'kept' })
      await ctx.db.insert('inboundMessages', { emailId: 'em_1', route: 'reply', to: 'reply-aaaaaaaaaaaaaaaa@in.example.com', from: GONE, subject: 'Re: comment', text: 'I agree', attachments: [], receivedAt: now, userId: gone, thread: 'strip:1' })
      await ctx.db.insert('inboundMessages', { emailId: 'em_2', route: 'support', to: 'support@example.com', from: GONE, subject: 'Question', text: 'Where is it?', attachments: [], receivedAt: now, threadId: 'th_1' })
      await ctx.db.insert('inboundMessages', { emailId: 'em_3', route: 'support', to: 'support@example.com', from: 'stays@example.com', subject: 'Hello', text: 'Hi', attachments: [], receivedAt: now, userId: stays, threadId: 'th_2' })
      await ctx.db.insert('replyAddresses', { token: 'aaaaaaaaaaaaaaaa', userId: gone, thread: 'strip:1', createdAt: now })
      await ctx.db.insert('replyAddresses', { token: 'bbbbbbbbbbbbbbbb', userId: stays, thread: 'strip:1', createdAt: now })
      await ctx.db.insert('secretOutbox', { message: { to: GONE, from: 'app@example.com', subject: 'Your code', text: '123456' }, attempts: 0, nextAttemptAt: now, generation: 1, expiresAt: now + 600_000 })
      await ctx.db.insert('heldEmails', { message: { to: GONE, subject: 'Strip tips', html: '<p>Hi</p>' }, from: 'tips@example.com', email: GONE, deliverAt: now + 3_600_000 })
      const storageId = await ctx.storage.store(new Blob(['{}']))
      const exportId = await ctx.db.insert('accountExports', { userId: gone, storageId, createdAt: now, expiresAt: now + ACCOUNT_EXPORT_LINK_MS })
      const partId = await ctx.storage.store(new Blob(['zip']))
      await ctx.db.insert('accountExportParts', { exportId, userId: gone, storageId: partId, bytes: 3, files: 1, createdAt: now })
      // A deletion waiting out its grace period, with the hash of its keep token.
      await ctx.db.insert('accountDeletions', { userId: gone, requestedAt: now, deletesAt: now + 86_400_000, tokenHash: 'hash-of-the-keep-token' })
      // The content duties: a strip it reported in a click and sent a notice about from its address, which it
      // decided and flagged as an administrator; a decision on its own strip with its appeal; and a stranger's notice.
      const subject = await ctx.db.insert('reportSubjects', { table: 'strips', subjectId: 'strip-1', status: 'hidden', open: 0, crime: { at: now, by: gone, note: 'A threat.' }, updatedAt: now })
      await ctx.db.insert('reports', { subject, kind: 'report', reason: 'abuse', details: 'Gone finds it cruel.', reporterId: gone, status: 'closed', outcome: 'hidden', createdAt: now, closedAt: now })
      await ctx.db.insert('reports', { subject, kind: 'notice', reason: 'intimate', details: 'It shows a photo of me.', url: 'https://app.example.com/strips/strip-1', notifier: { name: 'Gone', email: GONE, locale: 'de' }, signature: 'Gone Person', status: 'closed', outcome: 'hidden', crime: { at: now, by: gone }, createdAt: now, closedAt: now })
      await ctx.db.insert('reports', { kind: 'notice', reason: 'illegal', details: 'It names my street.', url: 'https://app.example.com/strips/strip-2', notifier: { name: 'Friend', email: 'friend@example.com' }, status: 'open', createdAt: now })
      const decided = await ctx.db.insert('reportDecisions', { subject, action: 'hidden', reason: 'An intimate image shared without consent.', ground: 'illegal', by: gone, at: now, authorId: stays, appealTokenHash: 'hash-of-an-appeal-token' })
      const onItsStrip = await ctx.db.insert('reportDecisions', { subject, action: 'hidden', reason: 'Harassment, which section 4 of the terms forbids.', ground: 'terms', by: stays, at: now, authorId: gone, appealTokenHash: 'hash-of-its-appeal-token' })
      await ctx.db.insert('reportAppeals', { decision: decided, text: 'The photo is mine to share.', status: 'upheld', reason: 'It was shared without consent.', by: gone, createdAt: now, closedAt: now })
      await ctx.db.insert('reportAppeals', { decision: onItsStrip, text: 'Gone appeals: the strip is my own.', status: 'open', createdAt: now })
      await ctx.db.insert('blockedFiles', { sha256: 'a'.repeat(64), decision: decided, at: now })
      // The guest tries of the browser it signed up in, another browser's, and the referral tally it kept as a referrer.
      await ctx.db.insert('guestTries', { visitor: 'visitor-of-gone', done: 1, lastAt: now, userId: gone })
      await ctx.db.insert('guestTries', { visitor: 'visitor-of-stays', done: 1, lastAt: now, userId: stays })
      await ctx.db.insert('referralTallies', { referrerId: gone, referrals: 2, rewarded: 1 })
      return { gone, stays, personal, solo, shared, bought, received, storageId, partId, decided, onItsStrip }
    })
  }

  /** Every row of every table of the component. */
  const everything = () => root.run(async ctx => Object.fromEntries(await Promise.all(Object.keys(schema.tables).map(async table => [table, await ctx.db.query(table as 'user').collect()] as const))))

  const erase = async (target: { userId?: string, email?: string }) => {
    const plan = await root.mutation(api.account.forget, target)
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    return plan
  }

  test('leaves nothing of the account in any table, and everyone else\'s rows as they were', async () => {
    const seeded = await seed()
    const plan = await erase({ userId: seeded.gone })
    expect(plan).toEqual({ deleted: expect.arrayContaining([seeded.personal, seeded.solo]), left: [seeded.shared], email: GONE })
    expect(plan.deleted).toHaveLength(2)

    const tables = await everything()
    // A billing entity's deletion mark names it for 30 days, so no free plan starts for it again: an id, nothing more.
    const marks = new Set(tables.billingDeletions!.map(row => (row as { entityId: string }).entityId))
    expect(marks).toEqual(new Set([seeded.personal, seeded.solo, seeded.gone]))
    for (const [table, rows] of Object.entries(tables)) {
      if (table === 'billingDeletions') continue
      const text = JSON.stringify(rows)
      expect(text, `${table} still holds the account's id`).not.toContain(seeded.gone)
      expect(text, `${table} still holds the account's address`).not.toContain(GONE)
      expect(text, `${table} still names a workspace that went with it`).not.toContain(`"${seeded.personal}"`)
    }
    // The export's file went with its record, and so did its zip parts and the waiting deletion.
    expect(await root.run(ctx => ctx.storage.get(seeded.storageId))).toBeNull()
    expect(await root.run(ctx => ctx.storage.get(seeded.partId))).toBeNull()
    expect(tables.accountDeletions).toEqual([])

    // Everyone else's rows stay: the other account, the shared workspace and its trail.
    expect(tables.user!.map(row => (row as { email: string }).email)).toEqual(['stays@example.com'])
    expect(tables.organization!.map(row => (row as { slug: string }).slug)).toEqual(['acme'])
    expect(tables.member).toEqual([expect.objectContaining({ userId: seeded.stays, organizationId: seeded.shared })])
    expect(tables.invitation!.map(row => (row as { email: string }).email)).toEqual(['next@example.com'])
    expect(tables.flagOverrides).toEqual([expect.objectContaining({ override: { users: [seeded.stays] } })])
    expect(tables.consents).toEqual([expect.objectContaining({ userId: seeded.stays, kind: 'terms' })])
    expect(tables.guestTries).toEqual([expect.objectContaining({ visitor: 'visitor-of-stays', userId: seeded.stays })])
    expect(tables.referralTallies).toEqual([])
    expect(tables.contactMessages).toEqual([expect.objectContaining({ ref: 'cccccccccccc', userId: seeded.stays })])
    expect(tables.inboundMessages).toEqual([expect.objectContaining({ emailId: 'em_3', userId: seeded.stays })])
    expect(tables.replyAddresses).toEqual([expect.objectContaining({ token: 'bbbbbbbbbbbbbbbb', userId: seeded.stays })])
    expect(tables.billingEntitlements!.map(row => (row as { userId: string }).userId)).toEqual([seeded.shared])
    expect(tables.notifications).toEqual([expect.objectContaining({ userId: seeded.stays, type: 'workspace.member_removed', actorId: expect.stringMatching(/^erased:/) })])
    expect(tables.auditEvents).toEqual([expect.objectContaining({ type: 'workspace.member_removed', entityId: seeded.shared, subjectId: seeded.stays, actorId: expect.stringMatching(/^erased:/) })])
    // A gift is a record of a payment: it stays, neither name nor address of the account in it.
    const gifts = tables.billingGifts as Array<Record<string, unknown>>
    expect(gifts.find(gift => gift._id === seeded.bought)).toMatchObject({ purchaserUserId: expect.stringMatching(/^erased:/), recipientEmail: 'friend@example.com' })
    expect(gifts.find(gift => gift._id === seeded.bought)).not.toHaveProperty('purchaserName')
    expect(gifts.find(gift => gift._id === seeded.received)).toMatchObject({ recipientEmail: expect.stringMatching(/^erased:/), purchaserUserId: seeded.stays, claimedByUserId: expect.stringMatching(/^erased:/) })
    expect(gifts.find(gift => gift._id === seeded.received)).not.toHaveProperty('message')
    // What its AI calls cost stays in the totals, under the pseudonym, and so do the proofs the law asks to keep.
    expect(tables.aiCosts).toHaveLength(5)
    expect(tables.aiCosts!.find(row => (row as { day: number }).day === 172_800_000)).toMatchObject({ who: expect.stringMatching(/^erased:/), owner: seeded.shared })
    expect(tables.aiCosts!.find(row => (row as { day: number }).day === 259_200_000)).toMatchObject({ who: expect.stringMatching(/^erased:/), owner: 'app' })
    expect(tables.billingRenewalConsents).toEqual([expect.objectContaining({ checkoutId: 'co_1', entityId: expect.stringMatching(/^erased:/), userId: expect.stringMatching(/^erased:/) }), expect.objectContaining({ checkoutId: 'co_2', entityId: expect.stringMatching(/^erased:/) })])
    expect(tables.billingWithdrawals).toEqual([expect.objectContaining({ subscriptionId: 'sub_1', entityId: expect.stringMatching(/^erased:/), userId: expect.stringMatching(/^erased:/) })])
    // The content duties' records stay, and lose the person: the same pseudonym in every row.
    const alias = (tables.auditEvents![0] as { actorId: string }).actorId
    expect(tables.reports).toEqual([
      expect.objectContaining({ kind: 'report', reason: 'abuse', reporterId: alias, outcome: 'hidden' }),
      expect.objectContaining({ kind: 'notice', reason: 'intimate', details: 'It shows a photo of me.', url: 'https://app.example.com/strips/strip-1', outcome: 'hidden', crime: { at: expect.any(Number), by: alias } }),
      expect.objectContaining({ kind: 'notice', details: 'It names my street.', notifier: { name: 'Friend', email: 'friend@example.com' } }),
    ])
    expect(tables.reports![0]).not.toHaveProperty('details')
    expect(tables.reports![1]).not.toHaveProperty('notifier')
    expect(tables.reports![1]).not.toHaveProperty('signature')
    expect(tables.reportSubjects).toEqual([expect.objectContaining({ status: 'hidden', crime: { at: expect.any(Number), by: alias, note: 'A threat.' } })])
    expect(tables.reportDecisions).toEqual([
      expect.objectContaining({ _id: seeded.decided, reason: 'An intimate image shared without consent.', ground: 'illegal', by: alias, authorId: seeded.stays, appealTokenHash: 'hash-of-an-appeal-token' }),
      expect.objectContaining({ _id: seeded.onItsStrip, reason: 'Harassment, which section 4 of the terms forbids.', by: seeded.stays, authorId: alias }),
    ])
    expect(tables.reportAppeals).toEqual([
      expect.objectContaining({ decision: seeded.decided, text: 'The photo is mine to share.', status: 'upheld', reason: 'It was shared without consent.', by: alias }),
      expect.objectContaining({ decision: seeded.onItsStrip, status: 'open' }),
    ])
    expect(tables.reportAppeals![1]).not.toHaveProperty('text')
    expect(tables.blockedFiles).toEqual([expect.objectContaining({ sha256: 'a'.repeat(64), decision: seeded.decided })])
    // The other account's devices and suppression stay.
    expect(tables.knownDevices).toEqual([expect.objectContaining({ userId: seeded.stays })])
    expect(tables.suppressions).toEqual([expect.objectContaining({ email: 'stays@example.com' })])
    expect(JSON.stringify([tables.reports, tables.reportSubjects, tables.reportDecisions, tables.reportAppeals])).not.toContain('Gone')
    // Its own row goes last, with the address it held.
    expect(tables.accountErasures).toEqual([])
  })

  test('registers every table of the component as a participant, or as holding nothing of a person', () => {
    const covered = new Set<string>(Object.values(ACCOUNT_DATA_SOURCES).flatMap(source => source.where === 'component' ? [...source.tables] : []))
    for (const table of Object.keys(schema.tables)) {
      expect(covered.has(table) || Object.hasOwn(NO_PERSONAL_DATA, table), `${table} is neither a participant nor known to hold nothing of a person`).toBe(true)
    }
  })

  describe('the content duties', () => {
    /** Who takes part in one decided case, by address; the notifier has no account. */
    const PEOPLE = { reporter: 'reporter@example.com', notifier: 'notifier@example.com', author: 'author@example.com', administrator: 'admin@example.com' } as const
    type Role = keyof typeof PEOPLE

    /**
     * One decided case: a report in a click and a notice about a strip, the
     * decision that hid it with the author's appeal, and the administrator
     * who decided it, flagged it as a suspected crime and answered the appeal.
     */
    const seedCase = () => root.run(async (ctx) => {
      const now = Date.now()
      const user = (email: string) => ctx.db.insert('user', { name: email.split('@')[0]!, email, emailVerified: true, createdAt: now, updatedAt: now, role: 'user' })
      const ids: Partial<Record<Role, string>> = { reporter: await user(PEOPLE.reporter), author: await user(PEOPLE.author), administrator: await user(PEOPLE.administrator) }
      const crime = { at: now, by: ids.administrator!, note: 'A threat.' }
      const subject = await ctx.db.insert('reportSubjects', { table: 'strips', subjectId: 'strip-1', status: 'hidden', open: 0, crime, updatedAt: now })
      await ctx.db.insert('reports', { subject, kind: 'report', reason: 'abuse', details: 'The reporter finds it cruel.', reporterId: ids.reporter!, status: 'closed', outcome: 'hidden', createdAt: now, closedAt: now })
      await ctx.db.insert('reports', { subject, kind: 'notice', reason: 'intimate', details: 'It shows a photo of me.', url: 'https://app.example.com/strips/strip-1', notifier: { name: 'Nora Notifier', email: PEOPLE.notifier, locale: 'de' }, signature: 'Nora Notifier', status: 'closed', outcome: 'hidden', crime, createdAt: now, closedAt: now })
      const decision = await ctx.db.insert('reportDecisions', { subject, action: 'hidden', reason: 'An intimate image shared without consent.', ground: 'illegal', by: ids.administrator!, at: now, authorId: ids.author!, appealTokenHash: 'hash-of-the-appeal-token' })
      await ctx.db.patch(subject, { decisionId: decision })
      await ctx.db.insert('reportAppeals', { decision, text: 'The strip is my own work.', status: 'upheld', reason: 'It was shared without consent.', by: ids.administrator!, createdAt: now, closedAt: now })
      await ctx.db.insert('blockedFiles', { sha256: 'a'.repeat(64), decision, at: now })
      return ids
    })

    /** The report tables, as one text and by table. */
    const reportTables = async () => {
      const tables = await everything()
      const rows = Object.fromEntries((['reportSubjects', 'reports', 'reportDecisions', 'reportAppeals', 'blockedFiles'] as const).map(table => [table, tables[table] as Array<Record<string, unknown>>]))
      return { rows, text: JSON.stringify(rows) }
    }

    test.each([
      ['reporter', ['The reporter finds it cruel.']],
      ['notifier', ['Nora Notifier', '"de"']],
      ['author', ['The strip is my own work.']],
      ['administrator', []],
    ] as const)('an erased %s leaves no personal field behind, and the decision records stay', async (role: Role, words: readonly string[]) => {
      const ids = await seedCase()
      const userId = ids[role]
      // The notifier has no account: an erasure by address alone reaches the notice.
      await erase(userId ? { userId } : { email: PEOPLE[role] })
      const { rows, text } = await reportTables()
      for (const gone of [PEOPLE[role], ...words, ...(userId ? [userId] : [])]) expect(text, `${gone} is still in the report tables`).not.toContain(gone)
      // Everyone else is still named where they were.
      for (const [other, id] of Object.entries(ids)) if (other !== role) expect(text).toContain(id)
      if (role !== 'notifier') expect(text).toContain(PEOPLE.notifier)
      // The case stays: both reports, the decision with its statement of reasons, the appeal's outcome, the flag and the blocked hash.
      expect(rows.reports).toEqual([expect.objectContaining({ kind: 'report', reason: 'abuse', outcome: 'hidden' }), expect.objectContaining({ kind: 'notice', reason: 'intimate', details: 'It shows a photo of me.', outcome: 'hidden' })])
      expect(rows.reportDecisions).toEqual([expect.objectContaining({ action: 'hidden', ground: 'illegal', reason: 'An intimate image shared without consent.', appealTokenHash: 'hash-of-the-appeal-token' })])
      expect(rows.reportAppeals).toEqual([expect.objectContaining({ status: 'upheld', reason: 'It was shared without consent.' })])
      expect(rows.reportSubjects).toEqual([expect.objectContaining({ status: 'hidden', crime: expect.objectContaining({ note: 'A threat.' }) })])
      expect(rows.blockedFiles).toHaveLength(1)
      // Where it was named, the pseudonym is now.
      if (userId) expect(text).toMatch(/"erased:[\da-f]{16}"/)
    })
  })

  test('is idempotent: run again for an account under way, it answers the same plan and erases once', async () => {
    const seeded = await seed()
    const first = await root.mutation(api.account.forget, { userId: seeded.gone })
    const again = await root.mutation(api.account.forget, { userId: seeded.gone })
    expect(again).toEqual(first)
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await root.mutation(api.account.forget, { userId: seeded.gone })).toEqual({ deleted: [], left: [] })
  })

  test('erases by address alone, for someone without an account', async () => {
    const seeded = await seed()
    const plan = await erase({ email: 'Friend@Example.com ' })
    expect(plan).toEqual({ deleted: [], left: [], email: 'friend@example.com' })
    const tables = await everything()
    expect(JSON.stringify(tables.invitation)).not.toContain('friend@example.com')
    expect(JSON.stringify(tables.billingGifts)).not.toContain('friend@example.com')
    // The notice it sent stays, to be decided, without its name or address.
    const notice = (tables.reports as Array<Record<string, unknown>>).find(row => row.url === 'https://app.example.com/strips/strip-2')
    expect(notice).toMatchObject({ kind: 'notice', reason: 'illegal', details: 'It names my street.', status: 'open' })
    expect(notice).not.toHaveProperty('notifier')
    expect(JSON.stringify(tables.reports)).toContain(GONE)
    // The account stays untouched.
    expect(tables.user).toHaveLength(2)
    expect(JSON.stringify(tables.billingGifts)).toContain(seeded.gone)
  })

  test('marks each billing entity as deleting before anything else, so no free plan starts for it again', async () => {
    const seeded = await seed()
    await root.mutation(api.account.forget, { userId: seeded.gone })
    for (const entityId of [seeded.personal, seeded.solo, seeded.gone]) expect(await root.query(api.account.isDeleting, { entityId })).toBe(true)
    expect(await root.query(api.account.isDeleting, { entityId: seeded.shared })).toBe(false)
  })

  test('retries a participant that fails, then stops at it, logs account.erasure_failed, and resumes there when run again', async () => {
    const seeded = await seed()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const flags = vi.spyOn(ERASURE_PARTICIPANTS, 'flags').mockRejectedValue(new Error('poison row'))
    await erase({ userId: seeded.gone })
    expect(flags).toHaveBeenCalledTimes(ERASURE_ATTEMPTS)
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^\[nuxt-backend\] account\.erasure_failed: .*flags participant after 5 tries/), expect.any(Error))
    expect(await root.query(api.account.failedErasures, {})).toEqual([expect.objectContaining({ userId: seeded.gone, step: 'flags', attempts: ERASURE_ATTEMPTS })])
    // Recorded for administrators: the account is gone, so the row names none.
    const failed = (await everything()).auditEvents!.filter(row => (row as { type: string }).type === 'account.erasure_failed')
    expect(failed).toEqual([expect.objectContaining({ data: { source: 'flags', attempts: ERASURE_ATTEMPTS } })])
    expect(failed[0]).not.toHaveProperty('subjectId')
    // The participants before it are done; the ones after it wait.
    expect((await everything()).user!.map(row => (row as { _id: string })._id)).toEqual([seeded.stays])
    flags.mockRestore()
    await erase({ userId: seeded.gone })
    expect(await root.query(api.account.failedErasures, {})).toEqual([])
    expect(JSON.stringify((await everything()).flagOverrides)).not.toContain(seeded.gone)
  })

  test('exports what the component keeps of an account, never a token, a code or a key', async () => {
    const seeded = await seed()
    const data = await root.query(api.account.exportData, { userId: seeded.gone }) as Record<string, any>
    expect(data.account).toMatchObject({ email: GONE, name: 'Gone', locale: 'de' })
    expect(data.ownedAlone.sort()).toEqual([seeded.personal, seeded.solo].sort())
    expect(data.sessions).toEqual([expect.objectContaining({ ipAddress: '203.0.113.7', userAgent: 'Firefox' })])
    expect(data.workspaces.map((workspace: { slug: string }) => workspace.slug).sort()).toEqual(['acme', `personal-${seeded.gone.toLowerCase()}`, 'side-project'])
    expect(data.invitationsSent).toEqual([expect.objectContaining({ email: 'friend@example.com' })])
    expect(data.invitationsReceived).toEqual([expect.objectContaining({ inviterId: seeded.stays })])
    expect(data.giftsBought).toEqual([expect.objectContaining({ recipientEmail: 'friend@example.com', message: 'For you' })])
    expect(data.giftsReceived).toEqual([expect.objectContaining({ purchaserName: 'Stays', message: 'Enjoy' })])
    expect(data.giftsReceived[0]).not.toHaveProperty('purchaserEmail')
    expect(data.billing.map((row: { userId: string }) => row.userId).sort()).toEqual([seeded.personal, seeded.solo, seeded.gone].sort())
    expect(data.activity).toEqual([expect.objectContaining({ type: 'auth.signed_in' })])
    // The ledger, the account's rows only (the one kept by its address is not the export's to carry).
    expect(data.consents).toEqual([{ kind: 'terms', version: '2026-10-01', granted: true, at: expect.any(Number), source: 'sign-up' }])
    // What it wrote to the team, and what it mailed the app: the rows of its id only, with no reference and no reply token.
    expect(data.contactMessages).toEqual([expect.objectContaining({ message: 'Please delete my gallery.', delivery: 'support' })])
    expect(data.contactMessages[0]).not.toHaveProperty('ref')
    expect(data.inboundMessages).toEqual([expect.objectContaining({ subject: 'Re: comment', thread: 'strip:1' })])
    expect(data).not.toHaveProperty('replyAddresses')
    expect(data.deletion).toEqual({ requestedAt: expect.any(Number), deletesAt: expect.any(Number) })
    // What it reported in a click, and the decision on its strip with its appeal: never who decided, a crime flag, or a notice sent from its address.
    expect(data.contentReports).toEqual([{ subject: { table: 'strips', id: 'strip-1' }, reason: 'abuse', details: 'Gone finds it cruel.', status: 'closed', outcome: 'hidden', createdAt: expect.any(Number), closedAt: expect.any(Number) }])
    expect(data.contentDecisions).toEqual([{ subject: { table: 'strips', id: 'strip-1' }, action: 'hidden', reason: 'Harassment, which section 4 of the terms forbids.', ground: 'terms', at: expect.any(Number), appeal: { text: 'Gone appeals: the strip is my own.', status: 'open', createdAt: expect.any(Number), reason: null, closedAt: null } }])
    const text = JSON.stringify(data)
    for (const secret of [`token-${seeded.gone}`, '"publicKey"', `credential-${seeded.gone}`, '"hash"', 'hash-of-the-keep-token', 'hash-of-its-appeal-token', 'Gone Person', 'A threat.']) expect(text).not.toContain(secret)
    expect(await root.query(api.account.exportData, { userId: 'nobody' })).toBeNull()
  })

  test('counts at most three exports a day, and deletes each file when its link expires', async () => {
    const userId = 'u1'
    for (let made = 0; made < ACCOUNT_EXPORTS_PER_DAY; made++) {
      const { exportId } = await root.mutation(api.account.startExport, { userId })
      const stored = await root.action(api.account.storeExport, { exportId, data: `{"n":${made}}` })
      expect(stored?.url).toMatch(/^https:\/\//)
    }
    const refused = await root.mutation(api.account.startExport, { userId }).then(() => null, getBackendError)
    expect(refused).toMatchObject({ code: 'rate_limited', data: { limit: 'accountExport' } })
    // The deployment's clock runs a tick ahead of a frozen test clock per commit.
    expect(await root.query(api.account.exportStatus, { userId })).toMatchObject({ latest: { url: expect.any(String), expiresAt: expect.closeTo(Date.now() + ACCOUNT_EXPORT_LINK_MS, -2) }, remaining: 0 })
    /** The files in the component's storage, as text. */
    const files = () => root.run(async ctx => Promise.all((await ctx.db.system.query('_storage').collect()).map(async file => (await ctx.storage.get(file._id))?.text())))
    expect((await files()).sort()).toEqual(['{"n":0}', '{"n":1}', '{"n":2}'])
    vi.advanceTimersByTime(ACCOUNT_EXPORT_LINK_MS + 1)
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await root.query(api.account.exportStatus, { userId })).toEqual({ latest: null, remaining: 0 })
    expect(await files()).toEqual([])
  })

  test('schedules a deletion once, replaces its keep token, and cancels it by account or by token', async () => {
    const first = await root.mutation(api.account.requestDeletion, { userId: 'u1', graceMs: 1000, tokenHash: 'one' })
    expect(first).toEqual({ requestedAt: expect.any(Number), deletesAt: first.requestedAt + 1000, created: true })
    // Asking again keeps the date and replaces the token: the old link no longer works.
    vi.advanceTimersByTime(400)
    expect(await root.mutation(api.account.requestDeletion, { userId: 'u1', graceMs: 1000, tokenHash: 'two' })).toEqual({ ...first, created: false })
    expect(await root.query(api.account.deletion, { userId: 'u1' })).toEqual({ requestedAt: first.requestedAt, deletesAt: first.deletesAt })
    expect(await root.mutation(api.account.cancelDeletion, { tokenHash: 'one' })).toBeNull()
    expect(await root.mutation(api.account.cancelDeletion, { tokenHash: 'two' })).toEqual({ userId: 'u1' })
    expect(await root.query(api.account.deletion, { userId: 'u1' })).toBeNull()
    expect(await root.mutation(api.account.cancelDeletion, { userId: 'u1' })).toBeNull()
    await root.mutation(api.account.requestDeletion, { userId: 'u2', graceMs: 1000, tokenHash: 'three' })
    expect(await root.mutation(api.account.cancelDeletion, { userId: 'u2' })).toEqual({ userId: 'u2' })
  })

  test('erases an account only once its deletion is due, and never one that was cancelled', async () => {
    const seeded = await seed()
    await root.run(async (ctx) => {
      for (const row of await ctx.db.query('accountDeletions').collect()) await ctx.db.delete(row._id)
    })
    // Nothing scheduled: nothing to erase.
    expect(await root.mutation(api.account.forgetDue, { userId: seeded.gone })).toBeNull()
    await root.mutation(api.account.requestDeletion, { userId: seeded.gone, graceMs: 60_000, tokenHash: 'one' })
    expect(await root.mutation(api.account.forgetDue, { userId: seeded.gone })).toBeNull()
    expect((await everything()).user).toHaveLength(2)
    vi.advanceTimersByTime(60_001)
    const plan = await root.mutation(api.account.forgetDue, { userId: seeded.gone })
    expect(plan).toMatchObject({ email: GONE, left: [seeded.shared] })
    // Once the erasure started, the link no longer keeps the account.
    expect(await root.mutation(api.account.cancelDeletion, { tokenHash: 'one' })).toBeNull()
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    const tables = await everything()
    expect(tables.user!.map(row => (row as { email: string }).email)).toEqual(['stays@example.com'])
    expect(tables.accountDeletions).toEqual([])
  })

  test('a due deletion waits while the account became the only owner of a workspace others belong to', async () => {
    const seeded = await seed()
    await root.run(async (ctx) => {
      for (const row of await ctx.db.query('accountDeletions').collect()) await ctx.db.delete(row._id)
    })
    await root.mutation(api.account.requestDeletion, { userId: seeded.gone, graceMs: 60_000, tokenHash: 'one' })
    // During the grace period, the account makes a workspace and brings someone in.
    const team = await root.run(async (ctx) => {
      const id = await ctx.db.insert('organization', { name: 'Team', slug: 'team', createdAt: 0 })
      await ctx.db.insert('member', { organizationId: id, userId: seeded.gone, role: 'owner', createdAt: 0 })
      await ctx.db.insert('member', { organizationId: id, userId: seeded.stays, role: 'member', createdAt: 0 })
      return id
    })
    vi.advanceTimersByTime(60_001)
    const answer = await root.mutation(api.account.forgetDue, { userId: seeded.gone })
    expect(answer).toEqual({ postponed: [team], deletesAt: Date.now() + 24 * 60 * 60 * 1000 })
    expect((await everything()).user).toHaveLength(2)
    expect(await root.query(api.account.deletion, { userId: seeded.gone })).toMatchObject({ deletesAt: Date.now() + 24 * 60 * 60 * 1000 })
    // Ownership moves: the next due call erases it.
    await root.run(async (ctx) => {
      const member = (await ctx.db.query('member').collect()).find(row => row.organizationId === team && row.userId === seeded.stays)!
      await ctx.db.patch(member._id, { role: 'owner' })
    })
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1)
    expect(await root.mutation(api.account.forgetDue, { userId: seeded.gone })).toMatchObject({ email: GONE })
  })

  test('bundles an export\'s files into zip parts that go with the export', async () => {
    const userId = 'u1'
    const { exportId } = await root.mutation(api.account.startExport, { userId })
    const stored = await root.run(async ctx => ({
      a: await ctx.storage.store(new Blob([new Uint8Array(10).fill(1)], { type: 'image/png' })),
      b: await ctx.storage.store(new Blob([new Uint8Array(10).fill(2)], { type: 'image/png' })),
      gone: await ctx.storage.store(new Blob(['x'])),
    }))
    await root.run(ctx => ctx.storage.delete(stored.gone))
    const parts = await root.action(api.account.bundleFiles, { exportId, files: [
      { storageId: stored.a, name: 'files/a.png', size: 10 },
      { storageId: stored.b, name: 'files/b.png', size: 10 },
      // Gone, and too big to bundle: left out of every part.
      { storageId: stored.gone, name: 'files/gone.png', size: 10 },
      { storageId: stored.a, name: 'files/big.png', size: 64 * 1024 * 1024 },
    ] })
    expect(parts).toEqual([{ url: expect.stringMatching(/^https:\/\//), bytes: expect.any(Number), files: ['files/a.png', 'files/b.png'] }])
    const bytes = await root.run(async (ctx) => {
      const [part] = await ctx.db.query('accountExportParts').collect()
      return Array.from(new Uint8Array(await (await ctx.storage.get(part!.storageId))!.arrayBuffer()))
    })
    const unzipped = unzipSync(new Uint8Array(bytes))
    expect(Object.keys(unzipped).sort()).toEqual(['files/a.png', 'files/b.png'])
    expect(unzipped['files/a.png']).toEqual(new Uint8Array(10).fill(1))
    await root.action(api.account.storeExport, { exportId, data: '{}' })
    expect((await root.query(api.account.exportStatus, { userId })).latest?.parts).toEqual([{ url: parts[0]!.url, bytes: parts[0]!.bytes, files: 2 }])
    // The sweep of unclaimed uploads keeps a part while its export lives; the link ends with the export's.
    vi.advanceTimersByTime(ACCOUNT_EXPORT_LINK_MS + 1)
    await root.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await root.run(ctx => ctx.db.query('accountExportParts').collect())).toEqual([])
    expect(await root.query(api.account.exportStatus, { userId })).toMatchObject({ latest: null })
  })

  test('lists the workspaces an account is the only owner of while others belong to them', async () => {
    const seeded = await seed()
    // Acme has another owner: the account may go.
    expect(await root.query(api.account.soleOwnerships, { userId: seeded.gone })).toEqual([])
    await root.run(async (ctx) => {
      const team = await ctx.db.insert('organization', { name: 'Team', slug: 'team', createdAt: 0 })
      await ctx.db.insert('member', { organizationId: team, userId: seeded.gone, role: 'owner', createdAt: 0 })
      await ctx.db.insert('member', { organizationId: team, userId: seeded.stays, role: 'member', createdAt: 0 })
    })
    expect(await root.query(api.account.soleOwnerships, { userId: seeded.gone })).toHaveLength(1)
  })
})

describe('the app\'s half', () => {
  const components = componentsGeneric() as unknown as { backend: ComponentApi<'backend'> }
  const audit = setupAudit(components as never)
  const billing = { forgetAccount: vi.fn(async (_ctx: unknown, _erasure: unknown) => {}), exportAccount: vi.fn(async (_ctx: unknown, account: { userId: string }) => [{ entityId: account.userId, subscriptions: [], orders: [] }]) }
  const email = { forgetContact: vi.fn(async (_email: string) => {}), sendTemplate: vi.fn(async (_ctx: unknown, _name: string, _data: unknown, _options?: unknown) => null as string | null) }
  const notesFor = vi.fn((_userId: string) => [{ text: 'a note' }])
  const account = setupAccount(components as never, {
    graceMs: 7 * 24 * 60 * 60 * 1000,
    audit,
    billing,
    email,
    sources: {
      notes: {
        description: 'The notes the account wrote.',
        export: makeFunctionReference<'query'>('account:exportNotes') as never,
        forget: makeFunctionReference<'mutation'>('account:forgetNotes') as never,
      },
    },
  })
  const appSchema = defineSchema({ notes: defineTable({ userId: v.string(), text: v.string() }).index('userId', ['userId']) })
  const exportNotes = queryGeneric({ args: { userId: v.string() }, handler: async (_ctx, { userId }) => notesFor(userId) })
  // Two notes a batch, so the erasure runs it again until it is done.
  const forgetNotes = mutationGeneric({
    args: { userId: v.optional(v.string()), email: v.optional(v.string()) },
    handler: async (ctx, { userId }) => {
      if (!userId) return { done: true }
      const rows = await ctx.db.query('notes').withIndex('userId', q => q.eq('userId', userId)).take(2)
      for (const row of rows) await ctx.db.delete(row._id)
      return { done: rows.length < 2 }
    },
  })
  const forget = mutationGeneric({ args: { userId: v.optional(v.string()), email: v.optional(v.string()) }, handler: async (ctx, target) => account.forget(ctx as never, target) })
  const forgetEmail = mutationGeneric({ args: { email: v.string() }, handler: async (ctx, { email }) => account.forgetEmail(ctx as never, email) })
  const schedule = mutationGeneric({ args: { userId: v.string() }, handler: async (ctx, { userId }) => account.scheduleDeletion(ctx as never, userId) })
  const testApp = defineBackendTestApp(appSchema, {
    './_generated/api.js': () => Promise.resolve({}),
    './account.js': () => Promise.resolve({ ...account.api, exportNotes, forgetNotes, forget, forgetEmail, schedule }),
  })
  const exportRef = makeFunctionReference<'action'>('account:exportAccountData')
  const latestRef = makeFunctionReference<'query'>('account:getAccountExport')
  const deletionRef = makeFunctionReference<'query'>('account:getAccountDeletion')
  const keepRef = makeFunctionReference<'mutation'>('account:cancelAccountDeletion')
  const scheduleRef = makeFunctionReference<'mutation'>('account:schedule')
  // A week: a timer past 2^31 ms fires at once in a test.
  const GRACE_MS = 7 * 24 * 60 * 60 * 1000
  /** The token in the keep link of the latest "scheduled" email. */
  const lastKeepToken = () => {
    const calls = email.sendTemplate.mock.calls.filter(([, name]) => name === 'deletionScheduled')
    return new URL((calls.at(-1)![2] as { keepUrl: string }).keepUrl).searchParams.get('token')!
  }
  let t: ReturnType<typeof testApp>

  beforeAll(() => {
    vi.stubEnv('SITE_URL', 'http://localhost:3000')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    t = testApp()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    billing.forgetAccount.mockReset().mockResolvedValue(undefined)
    email.forgetContact.mockReset().mockResolvedValue(undefined)
    email.sendTemplate.mockReset().mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const activity = () => t.query(components.backend.audit.list, { view: { kind: 'all', viewerId: 'reader' }, paginationOpts: { numItems: 50, cursor: null } })

  test('exports the account\'s data, its billing records and the app\'s own, behind a link that expires within the hour', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const made = await ada.action(exportRef, {}) as { url: string, createdAt: number, expiresAt: number }
    // The deployment's clock runs a tick ahead of a frozen test clock per commit.
    expect(made).toEqual({ url: expect.stringMatching(/^https:\/\//), createdAt: expect.closeTo(Date.now(), -2), expiresAt: made.createdAt + ACCOUNT_EXPORT_LINK_MS, parts: [] })
    expect(await ada.query(latestRef, {})).toEqual({ latest: made, remaining: ACCOUNT_EXPORTS_PER_DAY - 1 })
    expect(notesFor).toHaveBeenCalledWith(ada.userId)
    expect(billing.exportAccount).toHaveBeenCalledWith(expect.anything(), { userId: ada.userId, deleted: [ada.workspaceId] })
    expect((await activity()).page).toEqual([expect.objectContaining({ type: 'account.data_exported', actor: expect.objectContaining({ id: ada.userId }) })])
    vi.advanceTimersByTime(ACCOUNT_EXPORT_LINK_MS + 1)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await ada.query(latestRef, {})).toEqual({ latest: null, remaining: ACCOUNT_EXPORTS_PER_DAY - 1 })
  })

  test('bundles the account\'s files into zip parts, listed beside its export', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    for (const byte of [1, 2]) {
      await t.mutation(components.backend.storage.store, { bytes: new Uint8Array(20).fill(byte).buffer, contentType: 'image/png', owner: { userId: ada.userId }, holder: ada.userId, limits: {} })
    }
    const made = await ada.action(exportRef, {}) as { parts: Array<{ url: string, bytes: number, files: number }> }
    expect(made.parts).toEqual([{ url: expect.stringMatching(/^https:\/\//), bytes: expect.any(Number), files: 2 }])
    expect(await ada.query(latestRef, {})).toMatchObject({ latest: { parts: made.parts } })
    vi.advanceTimersByTime(ACCOUNT_EXPORT_LINK_MS + 1)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await ada.query(latestRef, {})).toMatchObject({ latest: null })
  })

  test('schedules a deletion, emails the keep link, and erases the account when the grace period ends', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const deletion = await t.mutation(scheduleRef, { userId: ada.userId }) as { requestedAt: number, deletesAt: number }
    expect(deletion.deletesAt).toBe(deletion.requestedAt + GRACE_MS)
    expect(await ada.query(deletionRef, {})).toEqual(deletion)
    // The account works as before, and its address is told when and how to keep it.
    expect(email.sendTemplate).toHaveBeenCalledWith(expect.anything(), 'deletionScheduled', { email: 'ada@example.com', deletesAt: deletion.deletesAt, keepUrl: expect.stringMatching(/^http:\/\/localhost:3000\/account\/keep\?token=[\w-]{43}$/) }, expect.objectContaining({ idempotencyKey: expect.any(String) }))
    expect((await activity()).page).toEqual([expect.objectContaining({ type: 'account.deletion_scheduled', actor: expect.objectContaining({ id: ada.userId }) })])
    // Asking again keeps the date, sends a new link and schedules nothing more.
    expect(await t.mutation(scheduleRef, { userId: ada.userId })).toEqual(deletion)
    expect(email.sendTemplate).toHaveBeenCalledTimes(2)
    expect(billing.forgetAccount).not.toHaveBeenCalled()
    vi.advanceTimersByTime(GRACE_MS + 1)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(billing.forgetAccount).toHaveBeenCalledTimes(1)
    expect(email.forgetContact).toHaveBeenCalledWith('ada@example.com')
    expect(await t.query(components.backend.adapter.findOne, { model: 'user', where: [{ field: '_id', value: ada.userId }] } as never)).toBeNull()
    expect(await t.query(components.backend.account.deletion, { userId: ada.userId })).toBeNull()
  })

  test('schedules from a test\'s own context, as the docs\' example does', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.run(ctx => account.scheduleDeletion(ctx as never, ada.userId))
    expect((await ada.query(deletionRef, {}))?.deletesAt).toBeGreaterThan(Date.now())
    expect(await ada.mutation(keepRef, {})).toBe(true)
  })

  test('keeps the account with the emailed link, without signing in, once, and a newer link replaces the older', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.mutation(scheduleRef, { userId: ada.userId })
    const older = lastKeepToken()
    await t.mutation(scheduleRef, { userId: ada.userId })
    const newer = lastKeepToken()
    expect(newer).not.toBe(older)
    expect(await t.mutation(keepRef, { token: older })).toBe(false)
    expect(await t.mutation(keepRef, { token: 'not-a-token' })).toBe(false)
    expect(await t.mutation(keepRef, { token: newer })).toBe(true)
    expect(await t.mutation(keepRef, { token: newer })).toBe(false)
    expect(email.sendTemplate).toHaveBeenLastCalledWith(expect.anything(), 'deletionCanceled', { email: 'ada@example.com' }, expect.anything())
    expect(await ada.query(deletionRef, {})).toBeNull()
    expect((await activity()).page.map(event => event.type)).toEqual(expect.arrayContaining(['account.deletion_canceled']))
    // The timer fires at the end of the grace period and finds nothing to erase.
    vi.advanceTimersByTime(GRACE_MS + 1)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(billing.forgetAccount).not.toHaveBeenCalled()
    expect(await t.query(components.backend.adapter.findOne, { model: 'user', where: [{ field: '_id', value: ada.userId }] } as never)).not.toBeNull()
  })

  test('lets the signed-in account keep itself, and refuses an administrator acting as it', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const ada = await asUser(t, { email: 'ada@example.com' })
    const visited = await asUser(t, { impersonatedBy: admin.userId })
    await t.mutation(scheduleRef, { userId: ada.userId })
    expect(await t.mutation(keepRef, {}).then(() => null, getBackendError)).toMatchObject({ code: 'unauthenticated' })
    expect(await visited.mutation(keepRef, {}).then(() => null, getBackendError)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect(await visited.query(deletionRef, {})).toBeNull()
    expect(await ada.mutation(keepRef, {})).toBe(true)
    expect(await ada.mutation(keepRef, {})).toBe(false)
    expect(await ada.query(deletionRef, {})).toBeNull()
  })

  test('still schedules the deletion when the email cannot be sent, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    email.sendTemplate.mockRejectedValue(new Error('provider down'))
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.mutation(scheduleRef, { userId: ada.userId })
    expect(await ada.query(deletionRef, {})).toMatchObject({ deletesAt: expect.any(Number) })
    expect(warn.mock.calls.some(([line]) => String(line).includes('account.deletion_email_unsent'))).toBe(true)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ada@example.com')
  })

  test('refuses an export to an administrator acting as the account, and past three a day', async () => {
    const admin = await asUser(t, { role: 'admin', workspace: false })
    const visited = await asUser(t, { impersonatedBy: admin.userId })
    expect(await visited.action(exportRef, {}).then(() => null, getBackendError)).toMatchObject({ code: 'forbidden', data: { reason: 'impersonating' } })
    expect(await visited.query(latestRef, {})).toBeNull()
    expect(await t.action(exportRef, {}).then(() => null, getBackendError)).toMatchObject({ code: 'unauthenticated' })
    const ada = await asUser(t)
    for (let made = 0; made < ACCOUNT_EXPORTS_PER_DAY; made++) await ada.action(exportRef, {})
    expect(await ada.action(exportRef, {}).then(() => null, getBackendError)).toMatchObject({ code: 'rate_limited', data: { limit: 'accountExport' } })
  })

  test('runs the providers\' and the app\'s part of an erasure by name, each source until it is done', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    const acme = await seedWorkspace(t, { name: 'Acme' })
    await asUser(t, { workspace: acme, workspaceRole: 'owner' })
    await t.run(async (ctx) => {
      for (let index = 0; index < 5; index++) await ctx.db.insert('notes', { userId: ada.userId, text: `note ${index}` })
    })
    await t.run(ctx => ctx.db.insert('notes', { userId: 'someone else', text: 'kept' }))
    // Ada joins Acme as a member, so it is a workspace she leaves.
    await t.mutation(components.backend.adapter.create, { input: { model: 'member', data: { organizationId: acme, userId: ada.userId, role: 'member', createdAt: Date.now() } } } as never)
    const plan = await t.mutation(makeFunctionReference<'mutation'>('account:forget'), { userId: ada.userId })
    expect(plan).toEqual({ deleted: [ada.workspaceId], left: [acme], email: 'ada@example.com' })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(billing.forgetAccount).toHaveBeenCalledWith(expect.anything(), { userId: ada.userId, deleted: [ada.workspaceId], left: [acme] })
    expect(email.forgetContact).toHaveBeenCalledWith('ada@example.com')
    expect(await t.run(ctx => ctx.db.query('notes').collect())).toEqual([expect.objectContaining({ userId: 'someone else' })])
    expect(await t.query(components.backend.adapter.findOne, { model: 'user', where: [{ field: '_id', value: ada.userId }] } as never)).toBeNull()
  })

  test('retries a provider that fails, each wait twice the last, then gives up, logs it and records it for administrators', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    email.forgetContact.mockRejectedValue(new Error('provider down'))
    const ada = await asUser(t, { email: 'ada@example.com' })
    await t.mutation(makeFunctionReference<'mutation'>('account:forget'), { userId: ada.userId })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(email.forgetContact).toHaveBeenCalledTimes(ERASURE_ATTEMPTS)
    // The billing customer, done in the first run, ran once.
    expect(billing.forgetAccount).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls.filter(([line]) => String(line).includes('account.erasure_retried'))).toHaveLength(ERASURE_ATTEMPTS - 1)
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^\[nuxt-backend\] account\.erasure_failed: .*emailContact/))
    expect(JSON.stringify(error.mock.calls)).not.toContain('ada@example.com')
    expect((await activity()).page).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'account.erasure_failed', actor: expect.objectContaining({ kind: 'app' }), subject: null, data: { source: 'emailContact', attempts: ERASURE_ATTEMPTS } })]))
  })

  test('erases someone without an account by address, and refuses an address an account holds', async () => {
    const ada = await asUser(t, { email: 'ada@example.com' })
    expect(await t.mutation(makeFunctionReference<'mutation'>('account:forgetEmail'), { email: 'ADA@example.com' }).then(() => null, getBackendError))
      .toMatchObject({ code: 'invalid_input', data: { field: 'email', reason: 'has_account' } })
    await t.mutation(makeFunctionReference<'mutation'>('account:forgetEmail'), { email: 'Grace@example.com' })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(email.forgetContact).toHaveBeenCalledWith('grace@example.com')
    expect(billing.forgetAccount).not.toHaveBeenCalled()
    expect(await t.query(components.backend.adapter.findOne, { model: 'user', where: [{ field: '_id', value: ada.userId }] } as never)).not.toBeNull()
  })
})
