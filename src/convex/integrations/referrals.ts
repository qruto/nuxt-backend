import { createFunctionHandle, type FunctionReference, internalActionGeneric, makeFunctionReference, mutationGeneric, queryGeneric, type RegisteredAction, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import { v } from 'convex/values'
import { RECENT_SIGN_IN_SECONDS, RUN_REFERRAL_SWEEP_FUNCTION } from '../constants.js'
import { logBackend } from '../log.js'
import { checkedReferralTerms, codeFromInput, type ReferralCaps, type ReferralRewards, type ReferralState, type ReferralTerms } from '../referral-rules.js'
import type { Billing } from './billing/types/surface.js'
import type { RunWriteCtx } from './billing/types/base.js'
import { signInRefusal } from './access.js'
import { ADMIN_WRITE } from './billing/context.js'
import { BILLING_REWARDS, type BillingRewards, type RewardRecipient } from './billing/rewards.js'

// The referral program: what `backend/referrals.ts` builds with
// `setupReferrals`. The rows, the caps and the state of every referral live in
// the `backend` component (`components/backend/referrals.ts`); the rewards are
// the billing provider's, granted through the billing instance this is given
// (a discount at checkout, a pack claimed at no cost, a moved renewal date, a
// plan pass). This file holds what the app serves: a person's code and
// referrals, the claim, the admin console's view and the sweep that rewards a
// referral when its hold has ended.

type Id = string

/** The component functions the program calls (structural: the generated references satisfy it). */
export interface ReferralRefs {
  codeFor: FunctionReference<'mutation', 'internal', { userId: Id }, { code: string, sharePages: boolean }>
  peekCode: FunctionReference<'query', 'internal', { userId: Id }, { code: string, sharePages: boolean } | null>
  setSharing: FunctionReference<'mutation', 'internal', { userId: Id, share: boolean }, null>
  preview: FunctionReference<'query', 'internal', { code: string }, { inviter: string | null } | null>
  claim: FunctionReference<'mutation', 'internal', { code: string, userId: Id, terms: StoredTerms }, { claimed: true, id: Id, referrerId: Id } | { claimed: false, reason: ClaimRefusal }>
  mine: FunctionReference<'query', 'internal', { userId: Id }, { claimed: number, held: number, rewarded: number, referrals: ReferralEntry[] }>
  consoleRows: FunctionReference<'query', 'internal', { referrerId?: Id }, ReferralConsoleRows>
  resolveFlag: FunctionReference<'mutation', 'internal', { id: Id, resolution: 'release' | 'void' }, boolean>
  registerSweep: FunctionReference<'mutation', 'internal', { wake: string }, null>
  due: FunctionReference<'query', 'internal', { now: number, limit?: number }, { ids: Id[], more: boolean }>
  get: FunctionReference<'query', 'internal', { id: Id }, DueReferral | null>
  beginReward: FunctionReference<'mutation', 'internal', { id: Id, now: number }, 'grant' | 'capped' | 'skip'>
  noteGrant: FunctionReference<'mutation', 'internal', { id: Id, grant: { discountId?: string, endsAt?: number, done?: boolean } }, null>
  finishReward: FunctionReference<'mutation', 'internal', { id: Id }, boolean>
  deferReward: FunctionReference<'mutation', 'internal', { id: Id, until: number }, null>
  closeUnrewarded: FunctionReference<'mutation', 'internal', { id: Id, now: number }, boolean>
  voidReferral: FunctionReference<'mutation', 'internal', { id: Id, reason: 'refunded' | 'administrator' | 'account_erased' }, boolean>
}

/** The components `setupReferrals` is given: the app's generated `components`. */
export interface ReferralComponents {
  backend: { referrals: ReferralRefs }
}

/** The terms a referral keeps from its claim. */
export interface StoredTerms {
  referred?: { discount: string } | { trialDays: number }
  referrer?: { pack: string } | { months: number, plan?: string }
  holdMs: number
  caps: { perReferrer: number | null, perMonth: number | null }
}

/** Why a claim recorded nothing. */
export type ClaimRefusal = 'invalid' | 'own_code' | 'already_claimed' | 'too_late' | 'self_referral'

/** One referral as its referrer reads it: a state and a time, never who the other person is. */
export interface ReferralEntry {
  id: string
  state: ReferralState
  claimedAt: number
  rewardedAt: number | null
}

/** A referral as the sweep grants it. */
export interface DueReferral {
  id: Id
  state: string
  referrerId: Id
  referredId: Id
  orderId: string
  entityId: string
  terms: StoredTerms
  grant?: { discountId?: string, endsAt?: number, done?: boolean }
}

/** One referral row of the admin console. */
export interface ReferralConsoleRow {
  id: string
  referrerId: string
  state: ReferralState
  claimedAt: number
  paidAt: number | null
  holdUntil: number | null
  rewardedAt: number | null
  flags: string[]
  released: boolean
  capped: boolean
  voidedFor: string | null
}

/** What the component answers the console. */
export interface ReferralConsoleRows {
  totals: { claimed: number, held: number, rewarded: number, voided: number, capped: number, flagged: number }
  top: Array<{ referrerId: string, name: string | null, referrals: number, rewarded: number }>
  flagged: ReferralConsoleRow[]
  history: ReferralConsoleRow[]
}

/** The referrals view of the admin console. */
export interface ReferralConsole extends ReferralConsoleRows {
  /** The program's terms, as `setupReferrals` was given them. */
  program: ReferralProgram
}

/** What the person referred gets, in words a page can show. */
export type ReferredOffer
  = | { kind: 'discount', name: string, percentOff?: number, months?: number }
    | { kind: 'trial', days: number }

/** What the referrer gets, in words a page can show. */
export type ReferrerOffer
  = | { kind: 'pack', name: string }
    | { kind: 'months', months: number }

/** The program a page describes: what each side gets. `null` for a side with no reward. */
export interface ReferralProgram {
  referred: ReferredOffer | null
  referrer: ReferrerOffer | null
  /** The hold, in days. */
  holdDays: number
  caps: { perReferrer: number | null, perMonth: number | null }
}

/** A person's own code and the program it belongs to. */
export interface ReferralCodeView {
  /** The code, `/r/<code>` or `?ref=<code>`. */
  code: string
  /** Whether the share pages the person's rows have carry the code. */
  sharePages: boolean
  program: ReferralProgram
}

/** A person's referrals. */
export interface ReferralsView {
  claimed: number
  held: number
  rewarded: number
  referrals: ReferralEntry[]
}

/** What a visitor reads on the page a referral link opens. */
export interface ReferralPreview {
  /** The first name of the person who invited them, when they have one. */
  inviter: string | null
  program: ReferralProgram
}

/** The public functions `backend/referrals.ts` re-exports. */
export interface ReferralsApi {
  /** The signed-in person's code, made on the first call, and the program it belongs to. */
  getReferralCode: RegisteredMutation<'public', Record<string, never>, Promise<ReferralCodeView>>
  /** The signed-in person's referrals: counts, and each one's state. `null` when signed out. */
  getReferrals: RegisteredQuery<'public', Record<string, never>, Promise<ReferralsView | null>>
  /**
   * Claim a code for the signed-in account, the explicit step of a referral.
   * A code that cannot be used is ignored, never an error: `claimed` is
   * `false` and `reason` says why, and the sign-up goes on. `fromSignIn`
   * is the claim a link's page runs on its own after the sign-in it sent the
   * visitor to: it needs a sign-in from the last ten minutes
   * (`reauthentication_required` else), so a crafted link opened by someone
   * signed in earlier claims nothing by itself.
   */
  claimReferral: RegisteredMutation<'public', { code: string, fromSignIn?: boolean }, Promise<{ claimed: true } | { claimed: false, reason: ClaimRefusal }>>
  /** What a link's code offers, for the page it opens. Anyone may read it. `null` for a code that is none, or of someone who cannot invite. */
  previewReferral: RegisteredQuery<'public', { code: string }, Promise<ReferralPreview | null>>
  /** Choose whether share pages carry the signed-in person's code. */
  setReferralSharing: RegisteredMutation<'public', { share: boolean }, Promise<null>>
  /** The admin console's referrals view. `null` for anyone who is not an administrator now. */
  getReferralConsole: RegisteredQuery<'public', { referrerId?: string }, Promise<ReferralConsole | null>>
  /** Release or void a flagged referral's reward. An administrator's, in person, with a recent sign-in. */
  resolveReferral: RegisteredMutation<'public', { id: string, resolution: 'release' | 'void' }, Promise<{ resolved: boolean }>>
  /** The sweep that rewards what is due; woken by the component's cron. Internal. */
  runReferralSweep: RegisteredAction<'internal', { op?: 'sweep', referralId?: string }, Promise<null>>
}

/** What `setupReferrals` takes. */
export interface SetupReferralsOptions {
  /** The app's `setupBilling` instance: it grants the rewards and reports the payments and refunds. */
  billing: Billing
  /** What each side gets. With none, the program still attributes sign-ups. */
  rewards?: ReferralRewards
  /** How long a reward waits after the first payment (milliseconds). 30 days by default, 14 at the least. */
  hold?: number
  /** How many rewards one referrer earns, and the program grants in a month. */
  caps?: ReferralCaps
}

/** The app's referral program, from {@link setupReferrals}. */
export interface Referrals {
  /** The public functions `backend/referrals.ts` re-exports. */
  api: ReferralsApi
  /**
   * A person's code, for a page that carries it (a share page's badge).
   * Made on the first call from a mutation or an action; a query reads the
   * code that exists. `null` when the person has none, or turned the code off
   * for their share pages.
   */
  codeFor: (ctx: { runQuery: RunWriteCtx['runQuery'], runMutation?: RunWriteCtx['runMutation'] }, userId: string) => Promise<string | null>
  /** The program's terms as checked, with their defaults. */
  terms: ReferralTerms
}

const DAY_MS = 24 * 60 * 60 * 1000

const NO_ARGS = {} as const
const SWEEP_PASSES = 20
/** How long a referral whose grant failed waits before the sweep takes it up again: the sweep's own hour. */
const RETRY_AFTER_MS = 60 * 60 * 1000

/** What the app asks of the billing instance, found where `setupBilling` registered it. */
function rewardsOf(billing: Billing | undefined): BillingRewards {
  const found = billing ? BILLING_REWARDS.get(billing) : undefined
  if (!found) {
    throw new TypeError('[nuxt-backend] setupReferrals: `billing` is not a setupBilling instance. Pass the app\'s, from billing.ts: `setupReferrals(components, { billing })`.')
  }
  return found
}

/**
 * Set the referral program up in its own backend file (`backend/referrals.ts`).
 * Each person gets a code of their own, made the first time they ask. A
 * visitor who signs up through it claims the referral; the person's first
 * paid order, on the billing entity they pay for, starts the hold, and a
 * refund during it voids the referral. When the hold ends the program checks
 * the order again, applies the caps and grants the rewards: the referrer's
 * pack or free months here, and the person referred already had theirs at
 * checkout (a catalog discount, locked on, or trial days).
 *
 * @example
 * ```ts
 * import { setupReferrals } from 'nuxt-backend/billing'
 * import { DAY } from 'nuxt-backend/rate-limit'
 * import { components } from './_generated/api'
 * import { billing } from './billing'
 *
 * export const referrals = setupReferrals(components, {
 *   billing,
 *   rewards: { referred: { discount: 'friend' }, referrer: { pack: 'credits100' } },
 *   hold: 30 * DAY,
 *   caps: { perReferrer: 20, perMonth: 500 },
 * })
 *
 * export const { getReferralCode, getReferrals, claimReferral } = referrals.api
 * ```
 */
export function setupReferrals(components: ReferralComponents, options: SetupReferralsOptions): Referrals {
  const rewards = rewardsOf(options.billing)
  const terms = checkedReferralTerms(options)
  // Refused here, not at the first grant: the sweep would fail on it every hour, holding cap slots it never uses.
  if (terms.rewards.referrer && rewards.customEntity) {
    throw new TypeError('[nuxt-backend] setupReferrals: rewards.referrer goes to the referrer\'s own billing entity, which setupBilling\'s `resolveEntity` hides from the program. Drop `resolveEntity` from setupBilling, or `rewards.referrer` from setupReferrals and grant the referrer\'s reward in your own code.')
  }
  const refs = components.backend.referrals
  const sweepReference = makeFunctionReference<'action'>(RUN_REFERRAL_SWEEP_FUNCTION) as unknown as FunctionReference<'action', 'internal', { op?: 'sweep', referralId?: string }>

  /** Keep the handle the component's sweep wakes the app by. Never fails what registers it. */
  const registerSweep = async (ctx: Pick<RunWriteCtx, 'runMutation'>): Promise<void> => {
    try {
      await ctx.runMutation(refs.registerSweep, { wake: await createFunctionHandle(sweepReference) })
    }
    catch (error) {
      logBackend('warn', 'referrals.sweep_unregistered', 'The referral sweep could not be registered: export `runReferralSweep` from backend/referrals.ts (`export const { …, runReferralSweep } = referrals.api`), or no reward is granted when a hold ends.', error)
    }
  }

  /** The person-referred reward the catalog can back: a trial, or a discount it has and that has no code. */
  const referredTerm = (): StoredTerms['referred'] => {
    const referred = terms.rewards.referred
    if (!referred || 'trialDays' in referred) return referred
    const found = rewards.discount(referred.discount)
    if (found && !found.code) return referred
    const why = found ? 'a promotion that is redeemed by typing a code, which a referral never uses' : 'not in the catalog'
    logBackend('warn', 'referrals.reward_unavailable', `The referral program's discount '${referred.discount}' is ${why}: declare a discount without a code in billing.catalog.ts and run \`npx nuxt-backend billing sync\`. The person referred gets no discount until then.`)
    return undefined
  }

  /** The referrer's reward the catalog can back: free months, or a pack it sells. */
  const referrerTerm = async (ctx: Pick<RunWriteCtx, 'runQuery'>): Promise<StoredTerms['referrer']> => {
    const referrer = terms.rewards.referrer
    if (!referrer || 'months' in referrer || await rewards.hasPack(ctx, referrer.pack)) return referrer
    logBackend('warn', 'referrals.reward_unavailable', `The referral program's pack '${referrer.pack}' is not a credit pack of the catalog: run \`npx nuxt-backend billing sync\`. Referrers get no pack until then.`)
    return undefined
  }

  /**
   * The terms a new referral is claimed under: the program's, minus a reward
   * the catalog cannot back, which is logged and left out so a sign-up never
   * waits on the app's catalog.
   */
  const termsFor = async (ctx: Pick<RunWriteCtx, 'runQuery'>): Promise<StoredTerms> => {
    const referred = referredTerm()
    const referrer = await referrerTerm(ctx)
    return { ...(referred ? { referred } : {}), ...(referrer ? { referrer } : {}), holdMs: terms.holdMs, caps: terms.caps }
  }

  /** What the person referred gets, in words a page can show. */
  const referredOffer = (): ReferredOffer | null => {
    const referred = terms.rewards.referred
    if (referred && 'trialDays' in referred) return { kind: 'trial', days: referred.trialDays }
    const discount = referred ? rewards.discount(referred.discount) : undefined
    if (!discount || discount.code) return null
    return { kind: 'discount', name: discount.name, ...(discount.percentOff === undefined ? {} : { percentOff: discount.percentOff }), ...(discount.months === undefined ? {} : { months: discount.months }) }
  }

  /** What the referrer gets, in words a page can show. */
  const referrerOffer = async (ctx: Pick<RunWriteCtx, 'runQuery'>): Promise<ReferrerOffer | null> => {
    const referrer = terms.rewards.referrer
    if (referrer && 'months' in referrer) return { kind: 'months', months: referrer.months }
    return referrer && await rewards.hasPack(ctx, referrer.pack) ? { kind: 'pack', name: await rewards.packName(ctx, referrer.pack) } : null
  }

  /** The program in words a page can show. */
  const programOf = async (ctx: Pick<RunWriteCtx, 'runQuery'>): Promise<ReferralProgram> => ({
    referred: referredOffer(),
    referrer: await referrerOffer(ctx),
    holdDays: Math.round(terms.holdMs / DAY_MS),
    caps: terms.caps,
  })

  const getReferralCode = mutationGeneric({
    args: NO_ARGS,
    handler: async (ctx): Promise<ReferralCodeView> => {
      const me = await rewards.caller(ctx, 'getReferralCode', { impersonation: 'refused' })
      const { code, sharePages } = await ctx.runMutation(refs.codeFor, { userId: me.userId })
      await registerSweep(ctx)
      return { code, sharePages, program: await programOf(ctx) }
    },
  })

  const getReferrals = queryGeneric({
    args: NO_ARGS,
    handler: async (ctx): Promise<ReferralsView | null> => {
      const identity = await ctx.auth.getUserIdentity()
      return identity ? await ctx.runQuery(refs.mine, { userId: identity.subject }) : null
    },
  })

  const claimReferral = mutationGeneric({
    args: { code: v.string(), fromSignIn: v.optional(v.boolean()) },
    handler: async (ctx, { code: input, fromSignIn }): Promise<{ claimed: true } | { claimed: false, reason: ClaimRefusal }> => {
      const me = await rewards.caller(ctx, 'claimReferral', { impersonation: 'refused' })
      // Claiming on its own is for the sign-in the link's page started: only a sign-in that just happened.
      const stale = fromSignIn ? signInRefusal(await ctx.auth.getUserIdentity() as unknown as Record<string, unknown>, RECENT_SIGN_IN_SECONDS, 'claimReferral') : null
      if (stale) throw stale
      const code = codeFromInput(input)
      if (!code) return { claimed: false, reason: 'invalid' }
      const claimed = await ctx.runMutation(refs.claim, { code, userId: me.userId, terms: await termsFor(ctx) })
      if (!claimed.claimed) return claimed
      await registerSweep(ctx)
      const referrer = await rewards.recipientOf(ctx, claimed.referrerId).catch(() => null)
      // The app records it: the referrer's activity never names who signed up.
      if (referrer) await options.billing.recordEvent(ctx, referrer.entityId, { type: 'referral.claimed', actor: null, targetId: claimed.id })
      return { claimed: true }
    },
  })

  const previewReferral = queryGeneric({
    args: { code: v.string() },
    handler: async (ctx, { code: input }): Promise<ReferralPreview | null> => {
      const code = codeFromInput(input)
      const found = code ? await ctx.runQuery(refs.preview, { code }) : null
      return found ? { inviter: found.inviter, program: await programOf(ctx) } : null
    },
  })

  const setReferralSharing = mutationGeneric({
    args: { share: v.boolean() },
    returns: v.null(),
    handler: async (ctx, { share }) => {
      const me = await rewards.caller(ctx, 'setReferralSharing', { impersonation: 'refused' })
      await ctx.runMutation(refs.setSharing, { userId: me.userId, share })
      return null
    },
  })

  const getReferralConsole = queryGeneric({
    args: { referrerId: v.optional(v.string()) },
    handler: async (ctx, { referrerId }): Promise<ReferralConsole | null> => {
      if (!await rewards.isAdmin(ctx, 'getReferralConsole')) return null
      return { ...await ctx.runQuery(refs.consoleRows, referrerId ? { referrerId } : {}), program: await programOf(ctx) }
    },
  })

  const resolveReferral = mutationGeneric({
    args: { id: v.string(), resolution: v.union(v.literal('release'), v.literal('void')) },
    handler: async (ctx, input): Promise<{ resolved: boolean }> => {
      await rewards.requireAdmin(ctx, 'resolveReferral', ADMIN_WRITE)
      return { resolved: await ctx.runMutation(refs.resolveFlag, input) }
    },
  })

  /**
   * Grant the referrer's reward, resuming from what an earlier try got
   * through. Answers when to try again instead, for free months a workspace
   * can't take yet: it holds a pass, and the months wait for its end rather
   * than being stacked on it or lost.
   */
  const grantReward = async (ctx: RunWriteCtx, id: string, referral: DueReferral, reward: NonNullable<StoredTerms['referrer']>, to: RewardRecipient): Promise<{ waitUntil: number } | null> => {
    if ('pack' in reward) {
      await rewards.grantPack(ctx, {
        referralId: id,
        to,
        pack: reward.pack,
        ...(referral.grant?.discountId ? { discountId: referral.grant.discountId } : {}),
        remember: async discountId => void await ctx.runMutation(refs.noteGrant, { id, grant: { discountId } }),
      })
    }
    else {
      const granted = await rewards.grantMonths(ctx, {
        referralId: id,
        to,
        months: reward.months,
        ...(reward.plan ? { plan: reward.plan } : {}),
        ...(referral.grant?.endsAt === undefined ? {} : { target: referral.grant.endsAt }),
        remember: async endsAt => void await ctx.runMutation(refs.noteGrant, { id, grant: { endsAt } }),
      })
      if (typeof granted === 'object') return granted
    }
    await ctx.runMutation(refs.noteGrant, { id, grant: { done: true } })
    return null
  }

  /**
   * Reward one referral whose hold has ended: the order is read again (a
   * refund voids the referral), the caps give it a slot (or record it with no
   * reward), and the referrer's reward is granted before the referral is
   * marked rewarded, so a grant that stops half way is tried again with the
   * same slot. A referral claimed with no referrer reward takes the
   * program's, when it names one now; with none, it is closed with no slot
   * and nothing that reads as a reward.
   */
  const rewardOne = async (ctx: RunWriteCtx, id: string): Promise<void> => {
    const referral = await ctx.runQuery(refs.get, { id })
    if (referral?.state !== 'held') return
    if (!await rewards.orderIsSound(referral.orderId)) {
      await ctx.runMutation(refs.voidReferral, { id, reason: 'refunded' })
      return
    }
    const reward = referral.terms.referrer ?? await referrerTerm(ctx)
    if (!reward) {
      // A reward the program names and the catalog can't back yet waits until it can.
      if (terms.rewards.referrer) await ctx.runMutation(refs.deferReward, { id, until: Date.now() + DAY_MS })
      else await ctx.runMutation(refs.closeUnrewarded, { id, now: Date.now() })
      return
    }
    if (await ctx.runMutation(refs.beginReward, { id, now: Date.now() }) !== 'grant') return
    const to = await rewards.recipientOf(ctx, referral.referrerId)
    // The referrer's account is gone or banned: nobody to pay.
    if (!to) {
      await ctx.runMutation(refs.voidReferral, { id, reason: 'account_erased' })
      return
    }
    if (!referral.grant?.done) {
      const wait = await grantReward(ctx, id, referral, reward, to)
      if (wait) {
        await ctx.runMutation(refs.deferReward, { id, until: wait.waitUntil })
        return
      }
    }
    if (!await ctx.runMutation(refs.finishReward, { id })) return
    await options.billing.recordEvent(ctx, to.entityId, { type: 'referral.rewarded', actor: null, targetId: id })
  }

  const runReferralSweep = internalActionGeneric({
    args: { op: v.optional(v.literal('sweep')), referralId: v.optional(v.string()) },
    handler: async (ctx, { referralId }): Promise<null> => {
      if (referralId) {
        await rewardOne(ctx, referralId)
        return null
      }
      // A referral whose grant failed is tried again an hour later, behind the ones due before it, so it never holds up the rest.
      const tried = new Set<string>()
      for (let pass = 0; pass < SWEEP_PASSES; pass++) {
        const { ids, more } = await ctx.runQuery(refs.due, { now: Date.now() })
        const fresh = ids.filter(id => !tried.has(id))
        for (const id of fresh) {
          tried.add(id)
          try {
            await rewardOne(ctx, id)
          }
          catch (error) {
            logBackend('error', 'referrals.sweep_task_failed', 'A referral reward failed; the sweep tries it again in an hour.', error)
            await ctx.runMutation(refs.deferReward, { id, until: Date.now() + RETRY_AFTER_MS }).catch(() => {})
          }
        }
        if (!more || fresh.length === 0) break
      }
      return null
    },
  })

  return {
    api: { getReferralCode, getReferrals, claimReferral, previewReferral, setReferralSharing, getReferralConsole, resolveReferral, runReferralSweep } as unknown as ReferralsApi,
    codeFor: async (ctx, userId) => {
      const found = ctx.runMutation ? await ctx.runMutation(refs.codeFor, { userId }) : await ctx.runQuery(refs.peekCode, { userId })
      return found?.sharePages ? found.code : null
    },
    terms,
  }
}
