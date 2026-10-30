/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentsGeneric, defineSchema, defineTable, type FunctionReference, internalMutationGeneric, makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import type { TestConvex } from 'convex-test'
import { asUser, defineBackendTestApp, type TestUser, type TestUserOptions } from '../../src/convex/test'
import { RECENT_SIGN_IN_SECONDS } from '../../src/convex/constants'
import { type BackendErrorCode, getBackendError } from '../../src/convex/errors'
import { setupBilling } from '../../src/convex/integrations/billing'
import { setupEmail } from '../../src/convex/integrations/email'
import { confirmationToken, unsubscribeToken } from '../../src/convex/email-preferences'
import { catalog } from '../fixtures/registration/backend/billing.generated'
import { SENSITIVE_ACTIONS, type SensitiveAction } from '../../src/convex/sensitive-actions'
import { sha256Hex } from '../../src/convex/tokens'
import { CALLERS, type InputRule, OPT_IN_POLICIES, type Policy, POLICIES, type Probe, refusingRule } from './authorization-policies'
import { GAPS } from './authorization-gaps'

// Every public function of the scaffold an app gets, called the way an
// attacker would: signed out, as someone else, as someone who no longer
// belongs, through an impersonation, and with inputs
// only the server may choose. Each must refuse exactly what its policy
// (authorization-policies.ts) refuses, bar the known gaps of the ratchet
// (authorization-gaps.ts). The scaffold runs as is: test/helpers/
// scaffold-backend.ts resolves its imports, so there is no codegen and no
// deployment.

const SCAFFOLD = '../fixtures/registration/backend/'
// The deployment config is no module of functions, and its component
// imports are for the Convex bundler only.
const scaffold = import.meta.glob(['../fixtures/registration/backend/*.ts', '!**/convex.config.ts', '!**/auth.config.ts'])
const testApp = defineBackendTestApp(defineSchema({}), {
  ...scaffold,
  // convex-test finds the functions' root by its `_generated` directory.
  [`${SCAFFOLD}_generated/api.js`]: () => Promise.resolve({}),
})
type App = ReturnType<typeof testApp>
type Kind = 'query' | 'mutation' | 'action'
const SITE = 'http://localhost:3000'

// The scaffold's catalog is empty until `billing sync` fills it, and the
// server sells nothing outside it: here it holds the principal's plan, a
// plan to switch to, and a credit pack to gift. Hoisted above the imports,
// so it names its ids itself.
vi.mock('../fixtures/registration/backend/billing.generated', () => ({
  catalog: { sandbox: {
    products: { pro: 'prod_probe', team: 'prod_probe_team', credits500: 'prod_probe_pack' },
    packs: ['credits500'],
    gifts: { credits500: 'prod_probe_pack_gift' },
    // A discount only the server applies, for the pack the probes buy: a client may not name it.
    discounts: { founder: { id: 'disc_probe_founder', name: 'Founder', percentOff: 30, duration: 'forever', productIds: ['prod_probe_pack'] } },
  } },
}))

// billing.ts reads the provider token when it loads. With none, a write
// fails on the missing token before it reaches its gate, and every probe of
// it would look refused.
vi.stubEnv('BILLING_ACCESS_TOKEN', 'probe-token')
vi.stubEnv('EMAIL_API_KEY', 're_probe')
// Better Auth signs a session out for `revokeSession`.
vi.stubEnv('SITE_URL', SITE)
vi.stubEnv('AUTH_SECRET', 'probe-secret-for-the-authorization-suite-0123456789')

// Working links of an email, for a contact that does not exist: the token is
// the authorization, and an unknown contact reads as nothing left to leave.
const LINK_TOKEN = await unsubscribeToken('probe-secret-for-the-authorization-suite-0123456789', 'contact_probe', '*')
const CONFIRM_TOKEN = await confirmationToken('probe-secret-for-the-authorization-suite-0123456789', 'contact_probe', 'probe', Date.now() + 86_400_000)

beforeAll(() => {
  // Sending an email and starting a stream schedule follow-up work; nothing
  // here asserts it, so it never runs, and never outlives the suite.
  vi.useFakeTimers()
  // No provider is ever reached: every request is refused, so a call that
  // gets that far fails past its gate, and nothing leaves the machine.
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'NotPermitted', detail: 'Probes never reach a provider.' }, { status: 403 })))
  // The package logs what the refused provider calls and skipped emails
  // leave behind; the outcomes are asserted, not the log.
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** The scaffold's public functions, `module:export` → kind, read from each module's exports. */
async function readPublicFunctions(): Promise<Map<string, Kind>> {
  const found = new Map<string, Kind>()
  for (const [path, load] of Object.entries(scaffold)) {
    const module = path.slice(SCAFFOLD.length, -'.ts'.length)
    for (const [name, value] of Object.entries(await load() as Record<string, unknown>)) {
      // A registered function is a function carrying its kind and visibility as flags.
      if (typeof value !== 'function') continue
      const fn = value as { isPublic?: boolean, isQuery?: boolean, isMutation?: boolean, isAction?: boolean }
      if (!fn.isPublic) continue
      const kind = fn.isQuery ? 'query' : fn.isMutation ? 'mutation' : fn.isAction ? 'action' : null
      if (kind) found.set(`${module}:${name}`, kind)
    }
  }
  return found
}

let enumerated: Promise<Map<string, Kind>> | undefined
const publicFunctions = () => enumerated ??= readPublicFunctions()

// --- The principal's world ---------------------------------------------------

const components = componentsGeneric() as unknown as Record<string, Record<string, Record<string, FunctionReference<'mutation', 'internal'>>>>
const FOREIGN = 'https://attacker.example/landing'
const PRODUCT = 'prod_probe'
// The plan a plan change switches to: the subscription is already on PRODUCT.
const OTHER_PLAN = 'prod_probe_team'
/** The catalog key of the credit pack a gift buys. */
const PACK = 'credits500'
const OFF_CATALOG = 'prod_off_catalog'
const CUSTOMER = 'cus_probe'

/** What the principal owns, for the probes that pass someone else's ids. */
interface Owned {
  /** The principal's own account, and the workspace it is active in. */
  userId: string
  workspaceId: string
  sessionId: string
  emailId: string
  giftId: string
  /** A gift the principal sent, for the changes only its purchaser makes. */
  sentGiftId: string
  subscriptionId: string
  orderId: string
  streamId: string
  /** What the opt-in setups act on, in the opt-in app only. */
  optIn?: OptInOwned
}

function run<T>(t: App, ref: FunctionReference<'mutation', 'internal'>, args: Record<string, unknown>): Promise<T> {
  return t.mutation(ref, args as never) as Promise<T>
}

/**
 * The principal's own things: another signed-in device, a sent email, a paid
 * gift, the billing entity's customer with a live subscription (set to
 * cancel at the period's end, with a plan change scheduled on it) and credits
 * (the principal's workspace, or the principal with `billTo: 'user'`), and
 * an AI stream.
 */
async function seedOwned(t: App, principal: TestUser, entityId = principal.workspaceId): Promise<Owned> {
  const { adapter, email, gifts, billing } = components.backend!
  const { lib } = components.polar!
  const now = Date.now()
  const iso = new Date(now).toISOString()
  const session = await run<{ _id: string }>(t, adapter!.create!, {
    input: { model: 'session', data: { userId: principal.userId, token: `probe-device-${principal.userId}`, createdAt: now, updatedAt: now, expiresAt: now + 86_400_000 } },
  })
  const emailId = await run<string>(t, email!.send!, { to: 'delivered@resend.dev', subject: 'Probe', text: 'probe' })
  const giftId = await run<string>(t, gifts!.create!, { recipientEmail: principal.email, purchaserUserId: 'purchaser', pack: PACK, productIds: ['prod_probe_pack'], giftProductId: 'prod_probe_pack_gift' })
  await run(t, gifts!.markPaid!, { giftId, billingOrderId: 'order_gift_probe' })
  await run(t, gifts!.setDiscount!, { giftId, discountId: 'disc_probe' })
  const sentGiftId = await run<string>(t, gifts!.create!, { recipientEmail: 'friend@example.com', purchaserUserId: principal.userId, pack: PACK, productIds: ['prod_probe_pack'], giftProductId: 'prod_probe_pack_gift' })
  await run(t, gifts!.markPaid!, { giftId: sentGiftId, billingOrderId: 'order_sent_gift_probe' })
  await run(t, gifts!.setDiscount!, { giftId: sentGiftId, discountId: 'disc_sent_probe' })
  // The catalog's products, as `billing sync` loads them: two plans and a pack.
  for (const [id, name, recurring] of [[PRODUCT, 'Pro', true], [OTHER_PLAN, 'Team', true], ['prod_probe_pack', '500 credits', false]] as const) {
    await run(t, lib!.createProduct!, {
      product: { id, createdAt: iso, modifiedAt: null, name, description: null, recurringInterval: recurring ? 'month' : null, isRecurring: recurring, isArchived: false, organizationId: 'org_probe', prices: [], medias: [] },
    })
  }
  if (entityId) {
    await run(t, lib!.insertCustomer!, { id: CUSTOMER, userId: entityId })
    await run(t, lib!.createSubscription!, {
      subscription: {
        id: 'sub_probe', customerId: CUSTOMER, createdAt: iso, modifiedAt: null, amount: 1000, currency: 'usd', recurringInterval: 'month', status: 'active',
        // Set to end, so its owner may uncancel it (and revoke it, below).
        currentPeriodStart: iso, currentPeriodEnd: null, cancelAtPeriodEnd: true, startedAt: iso, endedAt: null, productId: PRODUCT, checkoutId: null, metadata: {},
      },
    })
    await run(t, billing!.upsert!, {
      userId: entityId, customerId: CUSTOMER, activeProductIds: [PRODUCT], benefits: [],
      meters: [{ meterId: 'meter_probe', consumedUnits: 0, creditedUnits: 10, balance: 10 }],
    })
    // A plan change scheduled for the period's end, which its owner may cancel.
    await run(t, billing!.recordSubscriptionChange!, {
      subscriptionId: 'sub_probe', userId: entityId, pendingChange: { productId: OTHER_PLAN, appliesAt: now + 86_400_000 }, resumesAt: null, modifiedAt: now,
    })
  }
  const streamId = await run<string>(t, components.persistentTextStreaming!.lib!.createStream!, {})
  return { userId: principal.userId, workspaceId: entityId ?? '', sessionId: session._id, emailId, giftId, sentGiftId, subscriptionId: 'sub_probe', orderId: 'order_probe', streamId }
}

/**
 * Another manager's own plan, so a read of their entity answers with it
 * rather than the free plan's `null`, which reads like a refusal.
 */
async function seedOtherPlan(t: App, entityId: string): Promise<void> {
  const { lib } = components.polar!
  const iso = new Date().toISOString()
  await run(t, lib!.insertCustomer!, { id: 'cus_other', userId: entityId })
  await run(t, lib!.createSubscription!, {
    subscription: {
      id: 'sub_other', customerId: 'cus_other', createdAt: iso, modifiedAt: null, amount: 1000, currency: 'usd', recurringInterval: 'month', status: 'active',
      currentPeriodStart: iso, currentPeriodEnd: null, cancelAtPeriodEnd: false, startedAt: iso, endedAt: null, productId: PRODUCT, checkoutId: null, metadata: {},
    },
  })
}

/**
 * An account that held the principal's workspace and role when its token
 * was minted, and holds neither now: its membership is gone and its role is
 * back to `user`, as after a removal and a demotion.
 */
async function formerMember(t: App, principal: TestUser, role: string | undefined) {
  const { adapter } = components.backend!
  const former = await asUser(t, { workspace: principal.workspaceId ?? true, workspaceRole: 'admin', role })
  await run(t, adapter!.deleteOne!, {
    input: { model: 'member', where: [{ field: 'userId', value: former.userId }, { field: 'organizationId', value: former.workspaceId! }] },
  })
  await run(t, adapter!.updateOne!, { input: { model: 'user', where: [{ field: '_id', value: former.userId }], update: { role: 'user' } } })
  return former
}

/**
 * A personal workspace the account owns besides the one it joined, as every
 * real account has from its first sign-in: what a gift is bought from and
 * claimed into, so an account acting on its own has a billing entity of its
 * own.
 */
async function withPersonalWorkspace<T extends TestUser>(t: App, user: T): Promise<T> {
  const { adapter } = components.backend!
  const now = Date.now()
  const workspace = await run<{ _id: string }>(t, adapter!.create!, {
    input: { model: 'organization', data: { name: 'Personal', slug: `personal-${user.userId.toLowerCase()}`, createdAt: now } },
  })
  await run(t, adapter!.create!, { input: { model: 'member', data: { organizationId: workspace._id, userId: user.userId, role: 'owner', createdAt: now } } })
  return user
}

type Caller = Pick<TestConvex<never>, 'query' | 'mutation' | 'action'>

/** A fresh app with the principal's world in it, and the caller the probe calls as. */
/** A deletion waiting out its grace period for the account, so the read of it has something to answer whoever asks about their own. */
async function withDeletion<User extends TestUser>(t: App, user: User): Promise<User> {
  await run(t, components.backend!.account!.requestDeletion!, { userId: user.userId, graceMs: 30 * 86_400_000, tokenHash: `probe-hash-${user.userId}` })
  return user
}

/** The app a probe runs on, and how its functions are found and its principal's world seeded beyond {@link seedOwned}. */
interface Surface {
  app: () => App
  functions: () => Promise<Map<string, Kind>>
  seed?: (t: App, principal: TestUser, owned: Owned) => Promise<Owned>
}

const SCAFFOLD_SURFACE: Surface = { app: testApp, functions: publicFunctions }

async function probeWorld(policy: Policy, probe: Probe | 'principal', surface: Surface = SCAFFOLD_SURFACE, sandbox?: Pick<TestUserOptions, 'passkeyOnly' | 'signInMethod'>): Promise<{ caller: Caller, owned: Owned }> {
  const t = surface.app()
  const role = policy.access === 'admin' ? 'admin' : undefined
  const impersonatedBy = probe === 'impersonated' ? (await asUser(t, { role: 'admin', workspace: false })).userId : undefined
  // A sign-in a minute past the window a sensitive action takes.
  const signedInAt = probe === 'stale' ? Date.now() - (RECENT_SIGN_IN_SECONDS + 60) * 1000 : undefined
  const principal = await withDeletion(t, await asUser(t, { role, impersonatedBy, signedInAt, ...sandbox }))
  const seeded = await seedOwned(t, principal)
  const owned = surface.seed ? await surface.seed(t, principal, seeded) : seeded
  switch (probe) {
    case 'anonymous':
      return { caller: t, owned }
    case 'otherUser':
      return { caller: await withPersonalWorkspace(t, await withDeletion(t, await asUser(t, { workspace: principal.workspaceId, workspaceRole: 'member' }))), owned }
    case 'otherWorkspace':
      return { caller: await withPersonalWorkspace(t, await withDeletion(t, await formerMember(t, principal, role))), owned }
    case 'otherManager': {
      // The owner of a workspace of their own, with a plan of its own, passing the principal's ids.
      const manager = await withDeletion(t, await asUser(t))
      await seedOtherPlan(t, manager.workspaceId!)
      return { caller: manager, owned }
    }
    default:
      return { caller: principal, owned }
  }
}

// --- The calls ---------------------------------------------------------------

/** Where the buyer lands, and the metadata, with the probe's input in place of the page's. */
function landing(input: InputRule | undefined) {
  return {
    origin: SITE,
    successUrl: input === 'redirect' ? FOREIGN : `${SITE}/billing`,
    // Keys the package reads back from a paid order to deliver a gift.
    ...(input === 'metadata' ? { metadata: { gift: 'true', giftId: 'gift_of_someone_else' } } : {}),
  }
}

/** The arguments each function is called with; `{}` when it takes none. */
const ARGS: Record<string, (owned: Owned, input?: InputRule) => Record<string, unknown>> = {
  'admin:listUsers': () => ({ paginationOpts: { numItems: 10, cursor: null } }),
  'admin:getUser': owned => ({ userId: owned.userId }),
  'admin:listWorkspaces': () => ({ paginationOpts: { numItems: 10, cursor: null } }),
  'admin:getWorkspace': owned => ({ workspaceId: owned.workspaceId }),
  // A kill switch the scaffold always has, back to its default.
  'flags:setFlag': () => ({ key: 'pause_ai', override: null }),
  'flags:exposeExperiment': () => ({ key: 'pause_ai' }),
  'admin:getFunnel': () => ({ weeks: 4 }),
  'audit:recordSource': () => ({ answer: 'friend' }),
  'audit:listActivity': () => ({ paginationOpts: { numItems: 10, cursor: null } }),
  'audit:listWorkspaceActivity': () => ({ paginationOpts: { numItems: 10, cursor: null } }),
  'audit:listAllActivity': () => ({ paginationOpts: { numItems: 10, cursor: null } }),
  'notifications:listNotifications': () => ({ paginationOpts: { numItems: 10, cursor: null } }),
  'notifications:markNotificationsRead': () => ({ all: true }),
  'notifications:setNotificationChannel': () => ({ type: 'auth.passkey_added', channel: 'email', enabled: true }),
  // Without the scaffold's key pair, a subscription is refused past every gate (`unavailable`).
  'notifications:subscribePush': () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/probe', p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' }),
  'notifications:unsubscribePush': () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/probe' }),
  'ai:transform': () => ({ prompt: 'probe' }),
  'ai:getCosts': () => ({ since: 0 }),
  // The scaffold declares no consents: a kind it doesn't know is refused past every gate.
  'account:grantConsent': () => ({ kind: 'terms' }),
  'account:withdrawConsent': () => ({ kind: 'gallery' }),
  'account:chooseStorage': () => ({ purposes: [] }),
  // A link's token that names no deletion: the call answers `false`, nobody's account is touched.
  'account:cancelAccountDeletion': () => ({ token: 'probe-token' }),
  'auth:updateProfile': () => ({ name: 'Probe' }),
  'auth:revokeSession': owned => ({ sessionId: owned.sessionId }),
  // The credit pack: the principal already holds a plan, and a second plan
  // is refused for that, past every gate.
  'billing:generateCheckoutLink': (_, input) => ({
    productIds: [input === 'catalog' ? OFF_CATALOG : 'prod_probe_pack'],
    ...landing(input),
    ...(input === 'trial' ? { trialInterval: 'year', trialIntervalCount: 5 } : {}),
    ...(input === 'discount' ? { discount: 'founder' } : {}),
  }),
  'billing:generateCustomerPortalUrl': (_, input) => ({ returnUrl: input === 'redirect' ? FOREIGN : `${SITE}/billing` }),
  // A plan's catalog key is off the gift catalog too: gifts are packs only.
  'billing:giftCheckout': (_, input) => ({ pack: input === 'catalog' ? 'pro' : PACK, ...landing(input), recipientEmail: 'friend@example.com' }),
  'billing:claimGift': owned => ({ giftId: owned.giftId }),
  'billing:resendGift': owned => ({ giftId: owned.sentGiftId }),
  'billing:changeGiftRecipient': owned => ({ giftId: owned.sentGiftId, recipientEmail: 'another@example.com' }),
  'billing:rescheduleGift': owned => ({ giftId: owned.sentGiftId, deliverAt: Date.now() + 5 * 86_400_000 }),
  'billing:cancelGift': owned => ({ giftId: owned.sentGiftId }),
  'billing:updateSubscription': (owned, input) => ({ subscriptionId: owned.subscriptionId, productId: input === 'catalog' ? OFF_CATALOG : OTHER_PLAN }),
  // At once: the seeded subscription is already set to end, which refuses a second period-end cancel.
  'billing:cancelSubscription': owned => ({ subscriptionId: owned.subscriptionId, atPeriodEnd: false }),
  'billing:acceptSaveOffer': () => ({ offerId: 'offer_probe' }),
  'billing:withdraw': owned => ({ subscriptionId: owned.subscriptionId }),
  'billing:uncancelSubscription': owned => ({ subscriptionId: owned.subscriptionId }),
  'billing:cancelPendingChange': owned => ({ subscriptionId: owned.subscriptionId }),
  'billing:pauseSubscription': owned => ({ subscriptionId: owned.subscriptionId }),
  'billing:resumeSubscription': owned => ({ subscriptionId: owned.subscriptionId }),
  'billing:getInvoiceUrl': owned => ({ orderId: owned.orderId }),
  'billing:refundOrder': owned => ({ orderId: owned.orderId, reason: 'customer_request' }),
  'billing:getRevenue': () => ({ since: Date.now() - 7 * 24 * 60 * 60 * 1000 }),
  'email:getEmailStatus': owned => ({ emailId: owned.emailId }),
  // The scaffold declares no topics: one it doesn't know is refused past every gate.
  'email:setEmailTopic': () => ({ topic: 'probe', subscribed: false }),
  'email:recordTimeZone': () => ({ timeZone: 'Europe/Dublin' }),
  'email:getEmailLink': () => ({ token: LINK_TOKEN }),
  'email:unsubscribeByLink': () => ({ token: LINK_TOKEN }),
  'email:confirmEmailTopic': () => ({ confirm: CONFIRM_TOKEN }),
  'email:dismissAnnouncement': () => ({ id: 'announcement_probe' }),
  // A notice that names no announcement, or one past its own checks: nothing is published or sent.
  'email:publishAnnouncement': () => ({ message: '', expiresAt: 0 }),
  'email:endAnnouncement': () => ({ id: 'announcement_probe' }),
  'email:previewAnnouncement': () => ({ id: 'announcement_probe' }),
  'email:sendAnnouncement': () => ({ id: 'announcement_probe' }),
  'email:cancelAnnouncement': () => ({ id: 'announcement_probe' }),
  'email:getSuppressions': () => ({ paginationOpts: { numItems: 10, cursor: null } }),
  // An address nobody suppressed: past every gate, nothing is lifted and no provider is called.
  'email:liftSuppression': () => ({ email: 'probe@example.com' }),
  'webhooks:getWebhookDeliveries': () => ({ limit: 10 }),
  // A delivery the log does not hold: past every gate, refused on its id, and no provider is called.
  'webhooks:replayWebhookDelivery': () => ({ service: 'email', deliveryId: 'msg_probe' }),

  // The opt-in setups, on the principal's seeded things (seedOptIn).
  'admin:reportContent': owned => ({ subject: { table: 'strips', id: owned.optIn!.stripId }, reason: 'abuse' }),
  'admin:sendNotice': () => ({ url: `${SITE}/strips/probe`, reason: 'illegal', details: 'Probe.', name: 'Probe', email: 'notifier@example.com', goodFaith: true }),
  'admin:getAppeal': owned => ({ token: owned.optIn!.appealToken }),
  'admin:appealDecision': owned => ({ token: owned.optIn!.appealToken, text: 'Probe.' }),
  'admin:decideReport': owned => ({ subject: { table: 'strips', id: owned.optIn!.stripId }, action: 'dismiss', reason: 'Probe.' }),
  'admin:flagCrime': owned => ({ subject: { table: 'strips', id: owned.optIn!.stripId } }),
  'admin:decideAppeal': owned => ({ appealId: owned.optIn!.appealId, outcome: 'uphold', reason: 'Probe.' }),
  'access:checkInvite': () => ({ code: 'probe-code' }),
  'access:setAccessPhase': () => ({ phase: 'public' }),
  'access:createInvite': () => ({ kind: 'code', label: 'Probe', maxUses: 1 }),
  // An id nothing has: past every gate, nothing is revoked.
  'access:revokeInvite': () => ({ id: 'invite_probe' }),
  'access:admitEmails': () => ({ emails: ['admitted@example.com'] }),
  'waitlist:joinWaitlist': () => ({ email: 'joiner@example.com' }),
  'waitlist:waitlistStatus': owned => ({ token: owned.optIn!.waitlistToken }),
  'waitlist:leaveWaitlist': owned => ({ token: owned.optIn!.waitlistToken }),
  'waitlist:admitWaitlist': () => ({ ids: [] }),
  'waitlist:declineWaitlist': () => ({ ids: [] }),
  // An id nothing has: past every gate, nothing is noted.
  'waitlist:noteWaitlist': () => ({ id: 'entry_probe', note: 'Probe.' }),
  'files:getFileUrl': owned => ({ storageId: owned.optIn!.storageId }),
  'files:getShareLink': owned => ({ table: 'strips', id: owned.optIn!.stripId }),
  'files:enableShareLink': owned => ({ table: 'strips', id: owned.optIn!.stripId }),
  'files:revokeShareLink': owned => ({ table: 'strips', id: owned.optIn!.stripId }),
  'referrals:claimReferral': () => ({ code: 'NOPE' }),
  'referrals:previewReferral': owned => ({ code: owned.optIn!.referralCode }),
  'referrals:setReferralSharing': () => ({ share: false }),
  'referrals:resolveReferral': () => ({ id: 'referral_probe', resolution: 'void' }),
  'email:submitContactMessage': () => ({ name: 'Probe', email: 'sender@example.com', message: 'A probe of the contact form.' }),
  'email:getSandboxInbox': () => ({ address: 'delivered@resend.dev' }),
  'email:replyToInbox': () => ({ kind: 'contact', id: 'contact_probe', text: 'Probe.' }),
}

/** The codes that refuse a caller: who they are, not what they sent. */
const CALLER_REFUSALS = new Set<BackendErrorCode>(['unauthenticated', 'forbidden', 'no_workspace', 'reauthentication_required'])

/** The fields an `input:<rule>` probe must be refused on, as `invalid_input`. */
const INPUT_FIELDS: Record<InputRule, readonly string[]> = {
  catalog: ['productIds', 'productId', 'pack'],
  redirect: ['successUrl', 'origin', 'returnUrl'],
  metadata: ['metadata'],
  trial: ['trialInterval', 'trialIntervalCount'],
  discount: ['discount', 'discountId'],
}

/**
 * The ids a function takes that must be the caller's. Someone else's may be
 * answered as no such id (`invalid_input` on that field), so the answer never
 * tells which ids exist: `revokeSession` does.
 */
const OWNED_FIELDS = ['sessionId', 'giftId', 'orderId', 'subscriptionId', 'emailId', 'streamId']

/** The `forbidden` reasons that refuse a caller for each rule a probe breaks. */
const RULE_REASONS: Record<string, readonly string[]> = {
  impersonation: ['impersonating'],
  member: ['not_member'],
  admin: ['admin_only', 'role'],
  owned: ['not_owner', 'not_recipient', 'cannot_share'],
  banned: ['banned'],
}

/**
 * Whether the refusal is the one the rule names, so a probe refused for
 * some other reason never passes for the rule it probes: a signed-out
 * caller is `unauthenticated` (or the auth component's own
 * `ConvexError("Unauthenticated")` from `getAuthUser`), a member who
 * manages no billing `not_billing_manager` and a removed one `not_member`,
 * someone else's id `invalid_input` on that id or `forbidden` as not
 * theirs, and every other rule its own `forbidden` reason.
 */
function refusedByRule(probe: Probe, rule: string, error: unknown): boolean {
  const refusal = getBackendError(error)
  if (probe === 'anonymous') return refusal ? refusal.code === 'unauthenticated' : (error as { data?: unknown } | null)?.data === 'Unauthenticated'
  if (rule === 'recent') return refusal?.code === 'reauthentication_required'
  if (rule === 'owned' && refusal?.code === 'invalid_input') return OWNED_FIELDS.includes(refusal.data.field ?? '')
  const reasons = rule === 'manage' ? [probe === 'otherUser' ? 'not_billing_manager' : 'not_member'] : RULE_REASONS[rule] ?? []
  return refusal?.code === 'forbidden' && reasons.includes(refusal.data.reason ?? '')
}

/**
 * Whether `error` refuses `probe`. A caller probe its policy refuses is
 * refused only by the rule it breaks (see {@link refusedByRule}); one its
 * policy lets through counts as refused by anything that refuses a caller:
 * `unauthenticated`, `forbidden`, `no_workspace`. An `input:<rule>` probe
 * only by `invalid_input` on a field of its rule. The principal's own call
 * is refused by either. Anything else — `unavailable` from the refused
 * provider request, `not_ready`, a crash — came from past the gate.
 */
function refuses(probe: Probe | 'principal', error: unknown, rule: string | null): boolean {
  const refusal = getBackendError(error)
  const byCaller = refusal ? CALLER_REFUSALS.has(refusal.code) : (error as { data?: unknown } | null)?.data === 'Unauthenticated'
  const byInput = (rule: InputRule) => refusal?.code === 'invalid_input' && INPUT_FIELDS[rule].includes(refusal.data.field ?? '')
  if (probe === 'principal') return byCaller || refusal?.code === 'invalid_input'
  if (probe.startsWith('input:')) return byInput(probe.slice(6) as InputRule)
  return rule ? refusedByRule(probe, rule, error) : byCaller
}

interface Outcome {
  through: boolean
  /** A rate limit answered: the probe never reached the gate it tests, so the run proves nothing. */
  rateLimited: boolean
  /** What came back, for the failure message. */
  detail: string
}

/**
 * Whether a call got through its gate, as `probe`. A refusal is a refusing
 * error (see {@link refuses}), or a query's `null` (reads answer signed-out
 * and refused callers with `null`, so a reactive client settles instead of
 * retrying). A `null` carries no reason, so it counts for whichever rule
 * the probe breaks; what keeps that sound is the principal's own call, which
 * must get through with the same arguments — a query that answered `null`
 * to everyone would fail it. Anything else got through: a result, or a
 * failure past the gate, such as the scaffold's empty credit catalog or the
 * refused provider request.
 */
/** The input fields whose refusal means the call passed its gate, for a function that cannot succeed on the scaffold as it is. */
const PAST_THE_GATE: Record<string, string[]> = {
  'account:grantConsent': ['kind'],
  'account:withdrawConsent': ['kind'],
  // No offer was made, and no purchase is inside its withdrawal period, on the scaffold.
  'billing:acceptSaveOffer': ['offer'],
  'billing:withdraw': ['subscriptionId'],
  // The scaffold declares no topics, and the probes' notice is past its own checks or names no broadcast.
  'email:setEmailTopic': ['topic'],
  'email:publishAnnouncement': ['message'],
  'email:previewAnnouncement': ['id'],
  // The scaffold's log holds no delivery to replay.
  'webhooks:replayWebhookDelivery': ['deliveryId'],
  // The opt-in app has no support inbox to reply from.
  'email:replyToInbox': ['id'],
  // The id names no entry: past every gate, nothing is noted.
  'waitlist:noteWaitlist': ['id'],
}

/** Actions that answer a refused caller `null`, as a query does. */
const NULL_REFUSES = new Set(['waitlist:getWaitlistCaps'])

async function attempt(caller: Caller, kind: Kind, path: string, args: Record<string, unknown>, probe: Probe | 'principal', rule: string | null): Promise<Outcome> {
  try {
    const run = caller[kind] as (ref: FunctionReference<Kind>, args: Record<string, unknown>) => Promise<unknown>
    const result = await run(makeFunctionReference<typeof kind>(path), args)
    if ((kind === 'query' || NULL_REFUSES.has(path)) && result === null) return { through: false, rateLimited: false, detail: 'null' }
    return { through: true, rateLimited: false, detail: `returned ${JSON.stringify(result)?.slice(0, 120)}` }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const refusal = getBackendError(error)
    const code = refusal ? ` (${refusal.code}${refusal.code === 'invalid_input' ? ` ${refusal.data.field}` : ''}${refusal.code === 'forbidden' ? ` ${refusal.data.reason}` : ''})` : ''
    // A refusal of the kind itself is past every gate: the scaffold declares no consents to agree to.
    const pastGate = probe === 'principal' && refusal?.code === 'invalid_input' && (PAST_THE_GATE[path] ?? []).includes(refusal.data.field ?? '')
    return { through: pastGate || !refuses(probe, error, rule), rateLimited: refusal?.code === 'rate_limited', detail: `threw "${message.slice(0, 200)}"${code}` }
  }
}

function probesOf(policy: Policy): Probe[] {
  return [...CALLERS, ...(policy.inputs ?? []).map(rule => `input:${rule}` as const)]
}

// --- The suite ---------------------------------------------------------------

describe('the authorization policy registry', () => {
  // The first to call: it imports every module of the scaffold, and the package behind it.
  test('gives every public function of the scaffold a policy, and no other', async () => {
    const exported = [...(await publicFunctions()).keys()].sort()
    // The enumeration itself: a scaffold without these would mean the glob read nothing.
    expect(exported).toEqual(expect.arrayContaining(['auth:getAuthUser', 'billing:generateCheckoutLink', 'flags:setFlag']))
    expect(exported, 'a public function without a policy, or a policy without its function').toEqual(Object.keys(POLICIES).sort())
  }, 30_000)

  test('gives every public mutation and action a row of the sensitive-action table, which its policy agrees with', async () => {
    const writes = [...(await publicFunctions())].filter(([, kind]) => kind !== 'query').map(([path]) => path)
    expect(writes.filter(path => !Object.hasOwn(SENSITIVE_ACTIONS, path)), 'a public write without a row').toEqual([])
    for (const [path, row] of Object.entries(SENSITIVE_ACTIONS).filter(([key]) => !key.startsWith('/')) as Array<[string, SensitiveAction]>) {
      const policy = POLICIES[path]
      expect(policy, `${path} has a row, and no policy`).toBeDefined()
      expect(writes, `${path} is a row, and no public write of the scaffold`).toContain(path)
      expect(row.recentSignIn !== null, `${path}: recent sign-in`).toBe(policy!.recentSignIn === true)
      expect(row.impersonation, `${path}: impersonation`).toBe(policy!.impersonation ?? 'allowed')
    }
  })

  test('calls each function with arguments only it takes', () => {
    for (const path of Object.keys(ARGS)) expect({ ...POLICIES, ...OPT_IN_POLICIES }, `ARGS names ${path}`).toHaveProperty([path])
  })

  test('keeps the ratchet to real gaps: a known function, a probe its policy refuses, once each', () => {
    const seen = new Set<string>()
    for (const gap of GAPS) {
      const policy = POLICIES[gap.fn]
      expect(policy, `the gap names ${gap.fn}, which has no policy`).toBeDefined()
      expect(probesOf(policy!), `${gap.fn} is never probed as ${gap.probe}`).toContain(gap.probe)
      expect(gap.rule, `${gap.fn} as ${gap.probe}`).toBe(refusingRule(policy!, gap.probe))
      expect(gap.closedBy).toMatch(/^[A-Z][A-Z0-9]*\d[a-z]?$/)
      const key = `${gap.fn} ${gap.probe}`
      expect(seen.has(key), `${key} is listed twice`).toBe(false)
      seen.add(key)
    }
  })
})

function probeEach(policies: Record<string, Policy>, surface: Surface, name: string) {
  describe.each(Object.entries(policies))(name, (path, policy) => probeFunction(path, policy, surface))
}

function probeFunction(path: string, policy: Policy, surface: Surface) {
  const call = async (probe: Probe | 'principal') => {
    const kind = (await surface.functions()).get(path)
    expect(kind, `${path} is not a public function of its app`).toBeDefined()
    const { caller, owned } = await probeWorld(policy, probe, surface)
    const input = probe.startsWith('input:') ? probe.slice(6) as InputRule : undefined
    const rule = probe === 'principal' ? null : refusingRule(policy, probe)
    const outcome = await attempt(caller, kind!, path, ARGS[path]?.(owned, input) ?? {}, probe, rule)
    expect(outcome.rateLimited, `a rate limit answered, so the gate was never tested: ${outcome.detail}`).toBe(false)
    return outcome
  }

  test(policy.access === 'public' ? 'lets anyone through' : 'lets its principal through', async () => {
    const outcome = await call(policy.access === 'public' ? 'anonymous' : 'principal')
    expect(outcome.through, `refused its own principal: ${outcome.detail}`).toBe(true)
  })

  test.each(probesOf(policy))('as %s', async (probe) => {
    const rule = refusingRule(policy, probe)
    const gap = GAPS.find(entry => entry.fn === path && entry.probe === probe)
    const outcome = await call(probe)
    if (gap) {
      expect(outcome.through, `${gap.closedBy} closed it: drop the gap from authorization-gaps.ts (${outcome.detail})`).toBe(true)
    }
    else if (rule) {
      expect(outcome.through, `got through where the policy (${rule}) refuses it: ${outcome.detail}`).toBe(false)
    }
    else {
      expect(outcome.through, `refused where the policy lets it through: ${outcome.detail}`).toBe(true)
    }
  })
}

probeEach(POLICIES, SCAFFOLD_SURFACE, '%s')

// --- The opt-in setups -------------------------------------------------------

// Every public function a setup's `api` holds that the scaffold does not
// export: an app that turns on reports, a launch phase, the waitlist,
// files, referrals or the contact form re-exports them. This app
// re-exports every setup's whole `api`, the scaffold's own instances where
// it has them, and each function beyond the scaffold's gets a policy of
// OPT_IN_POLICIES and the same probes.

/** What the opt-in functions act on: the principal's own, where they have an owner. */
interface OptInOwned {
  /** A strip the principal wrote: reported and open, with a live share link. */
  stripId: string
  /** A file the principal uploaded. */
  storageId: string
  /** The appeal link of a decision that hid another strip of the principal's. */
  appealToken: string
  /** The open appeal of a third decision. */
  appealId: string
  /** A waitlist entry's signed status link. */
  waitlistToken: string
  /** The principal's referral code. */
  referralCode: string
}

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), char => char.charCodeAt(0))
const APPEAL_TOKEN = 'probe-appeal-token-hidden-0001'
const APPEALED_TOKEN = 'probe-appeal-token-appealed-0002'

/** The setups, once: their functions and the seed below share each instance. */
const optInSetups = (() => {
  let setups: Promise<Awaited<ReturnType<typeof createOptInSetups>>> | undefined
  return () => setups ??= createOptInSetups()
})()

async function createOptInSetups() {
  type Scaffold = Record<string, { api: Record<string, unknown> }>
  const [{ setupAdmin }, { setupAccess, setupWaitlist }, { setupStorage }, { setupReferrals }] = await Promise.all([
    import('nuxt-backend/admin'),
    import('nuxt-backend/access'),
    import('nuxt-backend/storage'),
    import('nuxt-backend/billing'),
  ])
  const own = {
    ...await import('../fixtures/registration/backend/account'),
    ...await import('../fixtures/registration/backend/ai'),
    ...await import('../fixtures/registration/backend/audit'),
    ...await import('../fixtures/registration/backend/billing'),
    ...await import('../fixtures/registration/backend/email'),
    ...await import('../fixtures/registration/backend/flags'),
    ...await import('../fixtures/registration/backend/notifications'),
    ...await import('../fixtures/registration/backend/webhooks'),
  } as unknown as Scaffold
  const app = componentsGeneric() as never
  const admin = setupAdmin(app, {
    email: own.email as never,
    reports: {
      describe: async (ctx, { table, id }) => {
        if (table !== 'strips') return null
        const strip = await ctx.db.get(id) as { title: string, authorId: string } | null
        return strip && { title: strip.title, authorId: strip.authorId }
      },
      hide: async (ctx, { id }) => ctx.db.patch(id, { hidden: true } as never),
    },
  })
  const access = setupAccess(app, { phases: ['early-access', 'invite-only', 'public'], audit: own.audit as never })
  const waitlist = setupWaitlist(app, { access, email: own.email as never })
  const storage = setupStorage(app)
  storage.shareable('strips' as never, { path: '/s', canShare: (ctx, strip) => (strip as { authorId: string }).authorId === ctx.user.id })
  const referrals = setupReferrals(app, { billing: own.billing as never, rewards: { referrer: { pack: PACK } } })
  // What the seed writes as the app would: a strip, a file, a waitlist entry past its code.
  const probe = {
    seedStrip: internalMutationGeneric({
      args: { authorId: v.string() },
      handler: async (ctx, { authorId }) => ctx.db.insert('strips' as never, { title: 'Probe', authorId } as never),
    }),
    seedFile: internalMutationGeneric({
      args: { userId: v.string() },
      handler: async (ctx, { userId }) => (await storage.store(ctx as never, PNG.slice().buffer as ArrayBuffer, { userId })).storageId,
    }),
    seedEntry: internalMutationGeneric({
      args: { email: v.string(), join: v.string() },
      handler: async (ctx, input) => (await access.gate.waitlist!(ctx as never, input)).token,
    }),
  }
  const modules: Record<string, object> = {
    account: own.account!.api,
    admin: admin.api,
    access: access.api,
    ai: own.ai!.api,
    audit: own.audit!.api,
    billing: own.billing!.api,
    email: own.email!.api,
    files: storage.api,
    flags: own.flags!.api,
    notifications: own.notifications!.api,
    referrals: referrals.api,
    waitlist: waitlist.api,
    webhooks: own.webhooks!.api,
    probe,
  }
  return { modules }
}

const optInSchema = defineSchema({
  strips: defineTable({ title: v.string(), authorId: v.string(), hidden: v.optional(v.boolean()) }),
})
const optInApp = defineBackendTestApp(optInSchema, {
  './_generated/api.js': () => Promise.resolve({}),
  ...Object.fromEntries(['account', 'admin', 'access', 'ai', 'audit', 'billing', 'email', 'files', 'flags', 'notifications', 'referrals', 'waitlist', 'webhooks', 'probe']
    .map(name => [`./${name}.js`, async () => (await optInSetups()).modules[name]])),
}) as unknown as () => App

/** The opt-in app's public functions beyond the scaffold's, `module:export` → kind. */
const optInFunctions = (() => {
  let found: Promise<Map<string, Kind>> | undefined
  return () => found ??= (async () => {
    const { modules } = await optInSetups()
    const scaffold = await publicFunctions()
    const map = new Map<string, Kind>()
    for (const [module, api] of Object.entries(modules)) {
      for (const [name, value] of Object.entries(api as Record<string, unknown>)) {
        const fn = value as { isPublic?: boolean, isQuery?: boolean, isMutation?: boolean, isAction?: boolean }
        const path = `${module}:${name}`
        if (typeof value !== 'function' || !fn.isPublic || scaffold.has(path)) continue
        map.set(path, fn.isQuery ? 'query' : fn.isMutation ? 'mutation' : 'action')
      }
    }
    return map
  })()
})()

const internalRef = (path: string) => makeFunctionReference<'mutation'>(path) as unknown as FunctionReference<'mutation', 'internal'>

/** The principal's things the opt-in functions act on. */
async function seedOptIn(t: App, principal: TestUser, owned: Owned): Promise<Owned> {
  const { reports, storage, waitlist, referrals } = components.backend!
  const [stripId, hiddenId, appealedId] = await Promise.all([0, 1, 2].map(() => run<string>(t, internalRef('probe:seedStrip'), { authorId: principal.userId })))
  const subject = (id: string) => ({ table: 'strips', id })
  for (const id of [stripId!, hiddenId!, appealedId!]) await run(t, reports!.fileReport!, { subject: subject(id), reporterId: 'reporter_probe', reason: 'abuse' })
  for (const [id, token] of [[hiddenId!, APPEAL_TOKEN], [appealedId!, APPEALED_TOKEN]] as const) {
    await run(t, reports!.decide!, { subject: subject(id), action: 'hidden', reason: 'Probe.', ground: 'terms', by: 'admin_probe', authorId: principal.userId, appealTokenHash: await sha256Hex(token) })
  }
  await run(t, reports!.fileAppeal!, { tokenHash: await sha256Hex(APPEALED_TOKEN), text: 'Probe.' })
  const rows = await t.query(reports!.reportsConsole! as unknown as FunctionReference<'query', 'internal'>, {}) as { appeals: Array<{ id: string }> }
  const storageId = await run<string>(t, internalRef('probe:seedFile'), { userId: principal.userId })
  await run(t, storage!.enableShare!, { table: 'strips', rowId: stripId!, tokenHash: await sha256Hex('probe-share'), userId: principal.userId })
  await run(t, waitlist!.stage!, { email: 'waiting@example.com', key: 'join_probe', source: 'form' })
  const waitlistToken = await run<string>(t, internalRef('probe:seedEntry'), { email: 'waiting@example.com', join: 'join_probe' })
  const { code: referralCode } = await run<{ code: string }>(t, referrals!.codeFor!, { userId: principal.userId })
  return { ...owned, optIn: { stripId: stripId!, storageId, appealToken: APPEAL_TOKEN, appealId: rows.appeals[0]!.id, waitlistToken, referralCode } }
}

const OPT_IN_SURFACE: Surface = { app: optInApp, functions: optInFunctions, seed: seedOptIn }

describe('the opt-in policy registry', () => {
  test('gives every public function of a setup beyond the scaffold\'s a policy, and no other', async () => {
    const found = [...(await optInFunctions()).keys()].sort()
    expect(found, 'the enumeration read nothing').toEqual(expect.arrayContaining(['admin:reportContent', 'waitlist:joinWaitlist']))
    expect(found, 'a public function without a policy, or a policy without its function').toEqual(Object.keys(OPT_IN_POLICIES).sort())
  }, 30_000)
})

probeEach(OPT_IN_POLICIES, OPT_IN_SURFACE, '%s (opt-in)')

// --- A sandbox's administrators ------------------------------------------------

// A sandbox is a public demo whose dev inbox anyone may read: every admin
// gate holds its administrators to one rule there — a passkey-only account,
// signed in to this very session with a passkey. A session a code opened
// is refused (`passkey_only_admin`, or a query's `null`), even once the
// account turned passkey-only; the same administrator signed in with a
// passkey gets through. Every admin function of the scaffold and the
// opt-in setups is probed, so a gate that decides the role its own way
// can't skip the rule.
const SANDBOX_ADMIN = [
  ...Object.entries(POLICIES).map(([path, policy]) => [path, policy, SCAFFOLD_SURFACE] as const),
  ...Object.entries(OPT_IN_POLICIES).map(([path, policy]) => [path, policy, OPT_IN_SURFACE] as const),
].filter(([, policy]) => policy.access === 'admin')

describe.each(SANDBOX_ADMIN)('%s on a sandbox', (path, policy, surface) => {
  const before = process.env.BACKEND_ENVIRONMENT
  beforeEach(() => {
    process.env.BACKEND_ENVIRONMENT = 'sandbox'
  })
  afterEach(() => {
    if (before === undefined) delete process.env.BACKEND_ENVIRONMENT
    else process.env.BACKEND_ENVIRONMENT = before
  })

  const call = async (signInMethod: 'passkey' | 'email-otp') => {
    const kind = (await surface.functions()).get(path)!
    const { caller, owned } = await probeWorld(policy, 'principal', surface, { passkeyOnly: true, signInMethod })
    const run = caller[kind] as (ref: FunctionReference<Kind>, args: Record<string, unknown>) => Promise<unknown>
    // A read answers a refused caller `null`, as the main probes count it.
    const nullRefuses = kind === 'query' || NULL_REFUSES.has(path)
    return run(makeFunctionReference<typeof kind>(path), ARGS[path]?.(owned) ?? {}).then(result => ({ result, error: null, nullRefuses }), (error: unknown) => ({ result: undefined, error, nullRefuses }))
  }

  test('refuses an administrator whose session a code opened', async () => {
    const { result, error, nullRefuses } = await call('email-otp')
    const refusal = getBackendError(error)
    const refused = refusal ? refusal.code === 'forbidden' && refusal.data.reason === 'passkey_only_admin' : nullRefuses && error === null && result === null
    expect(refused, `got through: ${error ? String(error).slice(0, 200) : JSON.stringify(result)?.slice(0, 120)}`).toBe(true)
  })

  test('lets the same administrator in, signed in with a passkey', async () => {
    const { result, error, nullRefuses } = await call('passkey')
    const refusal = getBackendError(error)
    expect((refusal?.data as { reason?: string } | undefined)?.reason, String(error).slice(0, 200)).not.toBe('passkey_only_admin')
    expect(nullRefuses && error === null && result === null, 'a read answered null').toBe(false)
  })
})

// --- Billing a user ----------------------------------------------------------

// With `billTo: 'user'` the caller is their own billing entity: there is no
// workspace to belong to, so the probes that remove or demote someone mean
// nothing. Every other row holds: who must be signed in, someone else's ids,
// the impersonated sessions each function refuses, and an
// account banned since its token was minted — refused by every billing
// function, the gifts included.
const userComponents = componentsGeneric()
const userBilling = setupBilling(userComponents as never, { email: setupEmail(userComponents as never), billTo: 'user', catalog })
const userBillingApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './billing.js': () => Promise.resolve({ ...userBilling.api }),
})
const USER_PROBES = ['anonymous', 'otherManager', 'impersonated', 'banned'] as const
type UserProbe = (typeof USER_PROBES)[number]
/** The member and manager rows: an admin function's gate is no different with `billTo: 'user'`. */
const USER_BILLING = Object.entries(POLICIES).filter(([path, policy]) => path.startsWith('billing:') && ['authed', 'member', 'manage'].includes(policy.access))

describe.each(USER_BILLING)('%s with billTo: \'user\'', (path, policy) => {
  const call = async (probe: UserProbe | 'principal') => {
    const kind = (await publicFunctions()).get(path)!
    const t = userBillingApp()
    const impersonatedBy = probe === 'impersonated' ? (await asUser(t, { role: 'admin', workspace: false })).userId : undefined
    const principal = await asUser(t, { impersonatedBy })
    const owned = await seedOwned(t as unknown as App, principal, principal.userId)
    // Banned after the token was minted: the token still says otherwise.
    if (probe === 'banned') {
      await run(t as unknown as App, components.backend!.adapter!.updateOne!, { input: { model: 'user', where: [{ field: '_id', value: principal.userId }], update: { banned: true } } })
    }
    // Another account, its own billing entity with a plan, passing the principal's ids.
    const other = probe === 'otherManager' ? await asUser(t) : null
    if (other) await seedOtherPlan(t as unknown as App, other.userId)
    const caller = probe === 'anonymous' ? t : other ?? principal
    const rule = probe === 'principal' ? null : probe === 'banned' ? 'banned' : refusingRule(policy, probe)
    // A banned caller is no probe of the registry: it is refused by its own rule.
    return { rule, outcome: await attempt(caller, kind, path, ARGS[path]?.(owned) ?? {}, probe === 'banned' ? 'otherUser' : probe, rule) }
  }

  test('lets its principal through', async () => {
    const { outcome } = await call('principal')
    expect(outcome.through, `refused its own principal: ${outcome.detail}`).toBe(true)
  })

  test.each(USER_PROBES)('as %s', async (probe) => {
    const { rule, outcome } = await call(probe)
    if (rule) expect(outcome.through, `got through where the policy (${rule}) refuses it: ${outcome.detail}`).toBe(false)
    else expect(outcome.through, `refused where the policy lets it through: ${outcome.detail}`).toBe(true)
  })
})

// --- The workspace a gift is bought from or claimed into -----------------------

// A gift lands on a workspace only through the checks every billing call
// makes: an older resolver of the app's own that ignores the rule it is
// handed, or a stale token naming a workspace the caller left, never makes
// a plain member or a former one its payer.
const olderResolver = setupBilling(userComponents as never, {
  email: setupEmail(userComponents as never),
  catalog,
  resolveEntity: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity() as { activeOrganizationId?: string } | null
    return identity?.activeOrganizationId ? { userId: identity.activeOrganizationId, email: '' } : null
  },
})
const olderResolverApp = defineBackendTestApp(defineSchema({}), {
  './_generated/api.js': () => Promise.resolve({}),
  './billing.js': () => Promise.resolve({ ...olderResolver.api }),
})

describe('a gift\'s workspace', () => {
  test.each([
    ['a plain member, through a resolver that ignores its rule', 'member', 'not_billing_manager'],
    ['a former member, through a resolver that ignores its rule', 'former', 'not_member'],
  ] as const)('is refused to %s', async (_, kind, reason) => {
    const t = olderResolverApp()
    const principal = await asUser(t)
    await seedOwned(t as unknown as App, principal)
    const caller = kind === 'member'
      ? await asUser(t, { workspace: principal.workspaceId, workspaceRole: 'member' })
      : await formerMember(t as unknown as App, principal, undefined)
    const refusal = await caller.action(makeFunctionReference<'action'>('billing:giftCheckout'), ARGS['billing:giftCheckout']!({} as Owned)).catch((error: unknown) => getBackendError(error))
    expect(refusal).toMatchObject({ code: 'forbidden', data: { reason } })
  })

  test('is refused to a former member whose stale token names it, with the default resolver', async () => {
    // No personal workspace of their own: the token's workspace is all they have.
    const t = testApp()
    const principal = await asUser(t)
    await seedOwned(t, principal)
    const caller = await formerMember(t, principal, undefined)
    const refusal = await caller.action(makeFunctionReference<'action'>('billing:giftCheckout'), ARGS['billing:giftCheckout']!({} as Owned)).catch((error: unknown) => getBackendError(error))
    expect(refusal).toMatchObject({ code: 'forbidden', data: { reason: 'not_member' } })
  })
})
