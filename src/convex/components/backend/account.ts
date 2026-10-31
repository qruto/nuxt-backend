import type { FunctionHandle } from 'convex/server'
import { v } from 'convex/values'
import { internal } from './_generated/api.js'
import type { Doc, Id, TableNames } from './_generated/dataModel.js'
import { action, internalMutation, mutation, type MutationCtx, query, type QueryCtx } from './_generated/server.js'
import { ACCOUNT_DATA_SOURCES, type AccountDataSourceKey } from '../../account-data.js'
import { backendError } from '../../errors.js'
import { logBackend } from '../../log.js'
import { ERASURE_BATCH, forgetBatch, pseudonym } from './audit.js'
import { consentRows, forgetConsents } from './consents.js'
import { forgetInbound, inboundRows } from './inbound.js'
import { eraseReports, reportRows } from './reports.js'
import { forgetAccess } from './access.js'
import { forgetReferrals, referralRows } from './referrals.js'
import { forgetFlagTargets } from './flags.js'
import { forgetFunnel } from './funnel.js'
import { isDelivered } from './gifts.js'
import { BATCH_TRANSACTION_LIMITS } from './maintenance.js'
import { eraseNotifications, exportNotifications } from './notifications.js'
import { erasePushSubscriptions, exportPushSubscriptions } from './push.js'
import { forgetDevices } from './devices.js'
import { forgetSuppression } from './suppressions.js'
import { eraseAnnouncements } from './announcements.js'
import { eraseLifecycle } from './lifecycle.js'
import { exportEmailPreferences, forgetEmailContact } from './preferences.js'
import { eraseFiles, exportFiles } from './storage.js'
import { zipSync } from 'fflate'

/**
 * Export and erasure: the component's half of an account's data rights.
 *
 * `forget` starts an account's erasure (or one by address alone, for
 * someone without an account): it decides which workspaces go with the
 * account, marks their billing entities as deleting, and runs each
 * participant of the registry (`ACCOUNT_DATA_SOURCES`) that lives in the
 * component, in order, in batches of at most {@link ERASURE_BATCH} rows,
 * one transaction each, each scheduling the next until nothing is left, as
 * the maintenance pass does. Every participant is idempotent: a batch that
 * throws rolls back alone and is retried, {@link ERASURE_ATTEMPTS} times
 * with a growing wait; then the erasure stops at it, logs
 * `account.erasure_failed`, records the event for administrators, and
 * resumes when `forget` runs for the account again. The provider's part
 * (the billing customer, the email contact) and the app's own tables run
 * in the app (`setupAccount`).
 *
 * `startExport`, `exportData`, `storeExport` and `exportStatus` are an
 * export's: a file in the component's storage behind a link that expires,
 * at most {@link ACCOUNT_EXPORTS_PER_DAY} a day.
 */

/** How many times a participant runs in a row before the erasure stops at it. */
export const ERASURE_ATTEMPTS = 5

/** The wait before a participant's first retry; each next one waits twice as long. */
export const ERASURE_RETRY_MS = 10_000

/** How many exports an account makes in a day. */
export const ACCOUNT_EXPORTS_PER_DAY = 3

/** How long an export's link works, after which its file is deleted. */
export const ACCOUNT_EXPORT_LINK_MS = 60 * 60 * 1000

/** The most input bytes one zip part of an export's files holds. */
const PART_BYTES = 16 * 1024 * 1024

/** The largest file that is bundled into a zip part: a bigger one keeps its own link only. */
const BUNDLE_FILE_MAX = 32 * 1024 * 1024

/** The most zip parts one export has. */
const EXPORT_PARTS_MAX = 200

/** The window the export limit counts in. */
const DAY_MS = 24 * 60 * 60 * 1000

/** The most memberships an erasure reads to decide which workspaces go: far more than a person holds. */
const MEMBERSHIPS_MAX = 500

/** The most activity rows an export carries: the newest ones. */
const EXPORT_ACTIVITY_MAX = 1000

/** The step after the last participant: the erasure's own row goes. */
const DONE = 'done'

/** An erasure in progress. */
type Erasure = Doc<'accountErasures'>

/** One participant's batch: deletes or rewrites at most a batch of rows; `true` while rows may be left. */
type Participant = (ctx: MutationCtx, erasure: Erasure) => Promise<boolean>

/** A budget of rows one batch writes, shared by the reads it makes. */
class Budget {
  left = ERASURE_BATCH
  get spent(): boolean {
    return this.left <= 0
  }

  /** Delete each row a read yields while the budget lasts. */
  async remove<Table extends TableNames>(ctx: MutationCtx, table: Table, rows: () => Promise<Array<Doc<Table>>>, onRemove?: (row: Doc<Table>) => Promise<void>): Promise<void> {
    if (this.spent) return
    for (const row of await rows()) {
      await onRemove?.(row)
      await ctx.db.delete(table, row._id)
      this.left--
    }
  }
}

/** Whether a role (a string or a comma-separated list) holds `owner`. */
function isOwner(role: string): boolean {
  return role.split(',').some(part => part.trim() === 'owner')
}

/** The account's billing entities an erasure deletes: the workspaces that go with it, and the account itself (billed on its own with `billTo: 'user'`). */
function entitiesOf(erasure: Pick<Erasure, 'userId' | 'deleted'>): string[] {
  return [...erasure.deleted, ...(erasure.userId ? [erasure.userId] : [])]
}

/**
 * The reverse trials of the entities that go: each row's workspace and
 * starter become the pseudonym (`rewrite` does that for the ids of `gone`),
 * kept under the hash of the address that started it.
 */
async function forgetTrialPasses(ctx: MutationCtx, gone: Set<string>, rewrite: (gift: Doc<'billingGifts'>, patch: Partial<Doc<'billingGifts'>>) => Promise<void>, budget: Budget): Promise<void> {
  for (const entityId of gone) {
    if (budget.spent) return
    const passes = await ctx.db.query('billingGifts').withIndex('claimedEntityId_passEndedAt', q => q.eq('claimedEntityId', entityId)).take(budget.left)
    for (const gift of passes.filter(row => row.reverseTrial || row.status === 'reward')) await rewrite(gift, {})
  }
}

/** The most versions of one namespace an erasure deletes: one for each embedding model an app used. */
const NAMESPACE_VERSIONS = 20

/**
 * Delete an owner's namespace in the RAG component, through the handles
 * its documents' rows carry: every version of it, each by the RAG
 * component's own deletion, which deletes the namespace's entries and
 * their passages first, in an action of its own.
 */
async function dropNamespace(ctx: MutationCtx, row: Doc<'aiDocuments'>, namespace: string): Promise<void> {
  if (!row.namespaces || !row.removeNamespace) return
  const versions = await ctx.runQuery(row.namespaces as FunctionHandle<'query', { namespace: string, paginationOpts: { numItems: number, cursor: null } }, { page: Array<{ namespaceId: string }> }>, { namespace, paginationOpts: { numItems: NAMESPACE_VERSIONS, cursor: null } })
  for (const { namespaceId } of versions.page) {
    await ctx.scheduler.runAfter(0, row.removeNamespace as FunctionHandle<'action', { namespaceId: string }>, { namespaceId })
  }
}

/** The account's memberships: at most {@link MEMBERSHIPS_MAX}, far more than a person holds. */
function membershipsOf(ctx: QueryCtx, userId: string): Promise<Array<Doc<'member'>>> {
  return ctx.db.query('member').withIndex('userId', q => q.eq('userId', userId)).take(MEMBERSHIPS_MAX)
}

/** A workspace's members, as a query to read from. */
function membersOf(ctx: QueryCtx, organizationId: string) {
  return ctx.db.query('member').withIndex('organizationId', q => q.eq('organizationId', organizationId))
}

/** Whether a workspace has members besides the account, and none of them an owner: the account's deletion would leave it without one. */
async function leftWithoutOwner(ctx: QueryCtx, organizationId: string, userId: string): Promise<boolean> {
  let others = false
  for await (const other of membersOf(ctx, organizationId)) {
    if (other.userId === userId) continue
    if (isOwner(other.role)) return false
    others = true
  }
  return others
}

/**
 * The participants that run in the component, by their key in the
 * registry, in the order an erasure runs them. The provider's (the billing
 * customer, the email contact) run in the app; the email records and Better
 * Auth's own limiter expire on their own.
 *
 * @internal
 */
export const ERASURE_PARTICIPANTS = {
  // The workspaces it leaves lose its membership, and the invitations it
  // sent or was sent go; the ones that go with it lose everything, the
  // workspace last.
  workspaces: async (ctx, { userId, email, left, deleted }) => {
    const budget = new Budget()
    if (userId) {
      for (const organizationId of left) {
        await budget.remove(ctx, 'member', () => ctx.db.query('member').withIndex('organizationId_userId', q => q.eq('organizationId', organizationId).eq('userId', userId)).take(budget.left))
      }
      await budget.remove(ctx, 'invitation', () => ctx.db.query('invitation').withIndex('inviterId', q => q.eq('inviterId', userId)).take(budget.left))
    }
    if (email) await budget.remove(ctx, 'invitation', () => ctx.db.query('invitation').withIndex('email', q => q.eq('email', email)).take(budget.left))
    for (const organizationId of deleted) {
      await budget.remove(ctx, 'member', () => ctx.db.query('member').withIndex('organizationId', q => q.eq('organizationId', organizationId)).take(budget.left))
      await budget.remove(ctx, 'invitation', () => ctx.db.query('invitation').withIndex('organizationId', q => q.eq('organizationId', organizationId)).take(budget.left))
      await budget.remove(ctx, 'auditEvents', () => ctx.db.query('auditEvents').withIndex('entityId_at', q => q.eq('entityId', organizationId)).take(budget.left))
      if (budget.spent) return true
      const id = ctx.db.normalizeId('organization', organizationId)
      const workspace = id ? await ctx.db.get('organization', id) : null
      if (workspace) {
        await ctx.db.delete('organization', workspace._id)
        budget.left--
      }
    }
    return budget.spent
  },

  // The account, its sessions, sign-in accounts and passkeys, and the codes
  // waiting for its address. Better Auth deleted the first three already
  // when it deleted the account; an erasure that starts here deletes them.
  auth: async (ctx, { userId, email }) => {
    const budget = new Budget()
    if (userId) {
      await budget.remove(ctx, 'session', () => ctx.db.query('session').withIndex('userId', q => q.eq('userId', userId)).take(budget.left))
      await budget.remove(ctx, 'account', () => ctx.db.query('account').withIndex('userId', q => q.eq('userId', userId)).take(budget.left))
      await budget.remove(ctx, 'passkey', () => ctx.db.query('passkey').withIndex('userId', q => q.eq('userId', userId)).take(budget.left))
    }
    if (email) {
      for (const identifier of [`sign-in-otp-${email}`, `email-verification-otp-${email}`, `forget-password-otp-${email}`]) {
        await budget.remove(ctx, 'verification', () => ctx.db.query('verification').withIndex('identifier', q => q.eq('identifier', identifier)).take(budget.left))
      }
      // An email change it started: Better Auth keys its code `change-email-otp-<address>-<new address>`.
      const change = `change-email-otp-${email}-`
      await budget.remove(ctx, 'verification', () => ctx.db.query('verification').withIndex('identifier', q => q.gte('identifier', change).lt('identifier', `${change}\uFFFF`)).take(budget.left))
    }
    if (budget.spent) return true
    const id = userId ? ctx.db.normalizeId('user', userId) : null
    const user = id ? await ctx.db.get('user', id) : null
    if (user) await ctx.db.delete('user', user._id)
    return false
  },

  // The tickets that wait for its address or name it.
  access: async (ctx, { userId, email }) => forgetAccess(ctx, { ...(userId ? { userId } : {}), ...(email ? { email } : {}) }),

  // The consent ledger: the account's rows and the rows kept by its address.
  consents: async (ctx, { userId, email }) => await forgetConsents(ctx, { ...(userId ? { userId } : {}), ...(email ? { email } : {}) }),

  // The contact messages and the mail the account sent, and the reply addresses made for it.
  inbound: async (ctx, { userId, email }) => await forgetInbound(ctx, { ...(userId ? { userId } : {}), ...(email ? { email } : {}) }),

  // The content duties' records stay, without the person: a notice from the
  // address loses its sender, and the account's id becomes the pseudonym
  // as a reporter, an author and an administrator (reports.ts).
  reports: async (ctx, erasure) => eraseReports(ctx, erasure, ERASURE_BATCH),

  // The share code and the referrals of the account.
  referrals: async (ctx, { userId }) => (userId ? await forgetReferrals(ctx, userId) : false),

  // The billing cache of every entity that goes with the account, and the trial it used.
  billing: async (ctx, erasure) => {
    const budget = new Budget()
    for (const entityId of entitiesOf(erasure)) {
      await budget.remove(ctx, 'billingEntitlements', () => ctx.db.query('billingEntitlements').withIndex('userId', q => q.eq('userId', entityId)).take(budget.left))
      await budget.remove(ctx, 'billingSubscriptionChanges', () => ctx.db.query('billingSubscriptionChanges').withIndex('userId', q => q.eq('userId', entityId)).take(budget.left))
      await budget.remove(ctx, 'billingDiscountAttempts', () => ctx.db.query('billingDiscountAttempts').withIndex('userId', q => q.eq('userId', entityId)).take(budget.left))
      await budget.remove(ctx, 'billingQuotaKeys', () => ctx.db.query('billingQuotaKeys').withIndex('userId_key', q => q.eq('userId', entityId)).take(budget.left))
      await budget.remove(ctx, 'billingSaveOffers', () => ctx.db.query('billingSaveOffers').withIndex('entityId_madeAt', q => q.eq('entityId', entityId)).take(budget.left))
    }
    const { userId } = erasure
    if (userId) await budget.remove(ctx, 'billingTrials', () => ctx.db.query('billingTrials').withIndex('ownerUserId', q => q.eq('ownerUserId', userId)).take(budget.left))
    return budget.spent
  },

  // A gift is a record of a payment: it stays, with the purchaser's or the
  // recipient's id and address, and the billing entities that went with
  // the account, as the pseudonym, and the purchaser's name and the
  // message gone. A rewritten row leaves the index the next read starts
  // from, so each batch reads from the start.
  gifts: async (ctx, erasure) => {
    const { userId, email, alias } = erasure
    const budget = new Budget()
    const gone = new Set(entitiesOf(erasure))
    const rewrite = async (gift: Doc<'billingGifts'>, patch: Partial<Doc<'billingGifts'>>) => {
      const ids = Object.fromEntries((['claimingUserId', 'claimedByUserId', 'purchaserEntityId', 'claimingEntityId', 'claimedEntityId'] as const)
        .filter(field => typeof gift[field] === 'string' && gone.has(gift[field] as string))
        .map(field => [field, alias]))
      await ctx.db.patch('billingGifts', gift._id, { ...patch, ...ids })
      budget.left--
    }
    if (userId) {
      for (const gift of await ctx.db.query('billingGifts').withIndex('purchaserUserId_createdAt', q => q.eq('purchaserUserId', userId)).take(budget.left)) {
        await rewrite(gift, { purchaserUserId: alias, purchaserEmail: undefined, purchaserName: undefined, message: undefined })
      }
    }
    if (email && !budget.spent) {
      for (const gift of await ctx.db.query('billingGifts').withIndex('recipientEmail', q => q.eq('recipientEmail', email)).take(budget.left)) {
        await rewrite(gift, { recipientEmail: alias, message: undefined })
      }
    }
    // A reverse trial's pass names its workspace and starter, under a hash
    // of the address that keeps a second trial from starting.
    if (!budget.spent) await forgetTrialPasses(ctx, gone, rewrite, budget)
    return budget.spent
  },

  // The proof of a renewal's consent and of a withdrawal is a record the
  // law asks for, kept its three years: the account that gave it becomes
  // the pseudonym, and so does a billing entity that goes with it. A
  // rewritten row leaves the index, so each batch reads from the start.
  billingProofs: async (ctx, erasure) => {
    const { userId, alias } = erasure
    if (!userId) return false
    const budget = new Budget()
    const gone = new Set(entitiesOf(erasure))
    const forget = (row: { userId?: string, entityId: string }) => ({
      ...(row.userId === userId ? { userId: alias } : {}),
      ...(gone.has(row.entityId) ? { entityId: alias } : {}),
    })
    for (const table of ['billingRenewalConsents', 'billingWithdrawals'] as const) {
      // The account's rows, then the rows of each entity that goes.
      const reads = [
        () => ctx.db.query(table).withIndex('userId', q => q.eq('userId', userId)),
        ...[...gone].map(entityId => () => ctx.db.query(table).withIndex('entityId', q => q.eq('entityId', entityId))),
      ]
      for (const read of reads) {
        if (budget.spent) return true
        for (const row of await read().take(budget.left)) {
          await ctx.db.patch(table, row._id, forget(row))
          budget.left--
        }
      }
    }
    return budget.spent
  },

  aiRequests: async (ctx, { userId }) => {
    if (!userId) return false
    const budget = new Budget()
    await budget.remove(ctx, 'aiRequests', () => ctx.db.query('aiRequests').withIndex('userId', q => q.eq('userId', userId)).take(budget.left))
    return budget.spent
  },

  // The jobs and budget windows of the entities that go; a job the account
  // started for a workspace that stays keeps its place, its starter the
  // pseudonym.
  jobs: async (ctx, erasure) => {
    const { userId, alias } = erasure
    const budget = new Budget()
    for (const entityId of entitiesOf(erasure)) {
      await budget.remove(ctx, 'jobs', () => ctx.db.query('jobs').withIndex('by_owner_and_status', q => q.eq('owner', entityId)).take(budget.left))
      await budget.remove(ctx, 'jobBudgets', () => ctx.db.query('jobBudgets').withIndex('by_owner_and_windowStart', q => q.eq('owner', entityId)).take(budget.left))
    }
    if (userId && !budget.spent) {
      for (const job of await ctx.db.query('jobs').withIndex('by_userId', q => q.eq('userId', userId)).take(budget.left)) {
        await ctx.db.patch('jobs', job._id, { userId: alias })
        budget.left--
      }
    }
    // The guest tries of the browser the account signed up in.
    if (userId && !budget.spent) await budget.remove(ctx, 'guestTries', () => ctx.db.query('guestTries').withIndex('by_userId', q => q.eq('userId', userId)).take(budget.left))
    return budget.spent
  },

  // What the account's AI calls cost, and the runs of the workspaces that
  // go, stays in the totals under the pseudonym, and so does the entity that
  // paid, when it goes too.
  aiCosts: async (ctx, erasure) => {
    const { alias } = erasure
    const budget = new Budget()
    const gone = new Set(entitiesOf(erasure))
    for (const who of gone) {
      if (budget.spent) break
      for (const cost of await ctx.db.query('aiCosts').withIndex('by_who', q => q.eq('who', who)).take(budget.left)) {
        await ctx.db.patch('aiCosts', cost._id, { who: alias, ...(gone.has(cost.owner) ? { owner: alias } : {}) })
        budget.left--
      }
    }
    return budget.spent
  },

  // The provenance records of the workspaces that go: the images are the app's.
  aiProvenance: async (ctx, erasure) => {
    const budget = new Budget()
    for (const entityId of entitiesOf(erasure)) {
      await budget.remove(ctx, 'aiProvenance', () => ctx.db.query('aiProvenance').withIndex('owner', q => q.eq('owner', entityId)).take(budget.left))
    }
    return budget.spent
  },

  // Its chat threads, and every thread kept in a workspace that goes with
  // it: the Agent component deletes the messages through the handle each
  // row carries, in the background. The delete is scheduled, never run in
  // this batch: a thread's messages alone could spend its transaction.
  aiThreads: async (ctx, erasure) => {
    const budget = new Budget()
    const dropThread = async (row: Doc<'aiThreads'>) => {
      await ctx.scheduler.runAfter(0, row.remove as FunctionHandle<'mutation', { threadId: string }>, { threadId: row.threadId })
    }
    if (erasure.userId) {
      const userId = erasure.userId
      await budget.remove(ctx, 'aiThreads', () => ctx.db.query('aiThreads').withIndex('userId', q => q.eq('userId', userId)).take(budget.left), dropThread)
    }
    for (const entityId of erasure.deleted) {
      await budget.remove(ctx, 'aiThreads', () => ctx.db.query('aiThreads').withIndex('owner', q => q.eq('owner', entityId)).take(budget.left), dropThread)
    }
    return budget.spent
  },

  // The knowledge documents of the workspaces that go with it, and their
  // namespace in the RAG component: once the batch that takes a
  // namespace's last row is done, the RAG component deletes its passages
  // in the background, then the namespace itself. A document it added to
  // a workspace that stays keeps its place, its adder the pseudonym.
  aiDocuments: async (ctx, erasure) => {
    const { userId, alias } = erasure
    const budget = new Budget()
    for (const entityId of entitiesOf(erasure)) {
      const documents = () => ctx.db.query('aiDocuments').withIndex('owner', q => q.eq('owner', entityId))
      let last = undefined as Doc<'aiDocuments'> | undefined
      await budget.remove(ctx, 'aiDocuments', () => documents().take(budget.left), async (row) => {
        last = row
        // A row from before the namespace's handles takes its own passages.
        if (!row.removeNamespace && row.entryId) await ctx.scheduler.runAfter(0, row.remove as FunctionHandle<'mutation', { entryId: string, startOrder: number }>, { entryId: row.entryId, startOrder: 0 })
      })
      if (last && !await documents().first()) await dropNamespace(ctx, last, entityId)
    }
    if (userId && !budget.spent) {
      for (const row of await ctx.db.query('aiDocuments').withIndex('addedBy', q => q.eq('addedBy', userId)).take(budget.left)) {
        await ctx.db.patch('aiDocuments', row._id, { addedBy: alias })
        budget.left--
      }
    }
    return budget.spent
  },

  // The devices the account signed in from, for new-device alerts.
  knownDevices: async (ctx, { userId }) => userId ? await forgetDevices(ctx, userId, ERASURE_BATCH) : false,

  // The address's copy of the provider's suppression: the provider keeps its own.
  suppressions: async (ctx, { email }) => {
    if (email) await forgetSuppression(ctx, email)
    return false
  },

  // The account's own record goes, its id a pseudonym in the rows that stay (audit.ts).
  audit: async (ctx, { userId, alias }) => userId ? await forgetBatch(ctx, userId, alias) : false,

  flags: async (ctx, { userId }) => {
    if (userId) await forgetFlagTargets(ctx, userId)
    return false
  },

  // Who the funnel counted, never the counts: they are keyed by step, value and week (funnel.ts).
  funnel: async (ctx, { userId }) => userId ? await forgetFunnel(ctx, userId, ERASURE_BATCH) : false,

  // Mail held for the address: a code waiting for the provider, and a send the quiet hours hold.
  email: async (ctx, { email }) => {
    if (!email) return false
    const budget = new Budget()
    // A code email for the address alone, by its index; one for several addresses (or from before 0.2) is read among the few without one.
    await budget.remove(ctx, 'secretOutbox', async () => ctx.db.query('secretOutbox').withIndex('recipient', q => q.eq('recipient', email)).take(budget.left))
    await budget.remove(ctx, 'secretOutbox', async () => (await ctx.db.query('secretOutbox').withIndex('recipient', q => q.eq('recipient', undefined)).take(ERASURE_BATCH))
      .filter(row => (Array.isArray(row.message.to) ? row.message.to : [row.message.to]).some(to => to.trim().toLowerCase() === email))
      .slice(0, Math.max(budget.left, 0)))
    // Its row goes, so nothing is sent at the quiet hours' end.
    await budget.remove(ctx, 'heldEmails', async () => ctx.db.query('heldEmails').withIndex('email', q => q.eq('email', email)).take(Math.max(budget.left, 0)))
    return budget.spent
  },

  // The account's topic choices and the sending rules' counts, by the account and by its address.
  emailPreferences: async (ctx, { userId, email }) => forgetEmailContact(ctx, { userId, email }),

  // The notifications for the account are deleted; its id becomes the pseudonym in the ones it caused for others.
  notifications: async (ctx, { userId, alias }) => eraseNotifications(ctx, { userId, alias }, ERASURE_BATCH),

  // The devices the account allowed web push on.
  pushSubscriptions: async (ctx, { userId }) => erasePushSubscriptions(ctx, userId, ERASURE_BATCH),

  // The announcements the account dismissed; its id becomes the pseudonym on the ones it published or sent.
  announcements: async (ctx, { userId, alias }) => eraseAnnouncements(ctx, { userId, alias }, ERASURE_BATCH),

  // The account's lifecycle runs: every email of a flow still waiting for it, and the record of those sent.
  lifecycle: async (ctx, { userId }) => eraseLifecycle(ctx, userId, ERASURE_BATCH),

  // The account's files and those of the workspaces that go with it, with
  // their counts and the links it shared; a file it uploaded to a workspace
  // that stays keeps its place, its uploader the pseudonym.
  files: async (ctx, erasure) => eraseFiles(ctx, erasure, ERASURE_BATCH),

  exports: async (ctx, { userId }) => {
    if (!userId) return false
    const budget = new Budget()
    await budget.remove(ctx, 'accountExportParts', () => ctx.db.query('accountExportParts').withIndex('userId', q => q.eq('userId', userId)).take(budget.left), async (row) => {
      await ctx.storage.delete(row.storageId)
    })
    await budget.remove(ctx, 'accountExports', () => ctx.db.query('accountExports').withIndex('userId_createdAt', q => q.eq('userId', userId)).take(budget.left), async (row) => {
      if (row.storageId) await ctx.storage.delete(row.storageId)
    })
    return budget.spent
  },

  // A deletion waiting out its grace period: whichever way the account goes, its record goes.
  deletions: async (ctx, { userId }) => {
    if (!userId) return false
    const budget = new Budget()
    await budget.remove(ctx, 'accountDeletions', () => ctx.db.query('accountDeletions').withIndex('userId', q => q.eq('userId', userId)).take(budget.left))
    return budget.spent
  },
} as const satisfies Partial<Record<AccountDataSourceKey, Participant>>

/** A participant that runs in the component. */
type Step = keyof typeof ERASURE_PARTICIPANTS

/** The steps in order: the registry's order, the component's participants only. */
const STEPS = (Object.keys(ACCOUNT_DATA_SOURCES) as AccountDataSourceKey[]).filter((key): key is Step => Object.hasOwn(ERASURE_PARTICIPANTS, key))

/** The step after `step`, or `done` after the last. */
function nextStep(step: string): string {
  const at = STEPS.indexOf(step as Step)
  return at >= 0 && at < STEPS.length - 1 ? STEPS[at + 1]! : DONE
}

/**
 * Which workspaces go with the account and which it leaves: one it is the
 * only member of goes, its personal workspace included; one others belong
 * to stays, its membership removed.
 */
async function planOf(ctx: QueryCtx, userId: string): Promise<{ deleted: string[], left: string[] }> {
  const deleted: string[] = []
  const left: string[] = []
  for (const member of await membershipsOf(ctx, userId)) {
    const members = await membersOf(ctx, member.organizationId).take(2)
    if (members.every(other => other.userId === userId)) deleted.push(member.organizationId)
    else left.push(member.organizationId)
  }
  return { deleted: [...new Set(deleted)], left: [...new Set(left)] }
}

/** Mark a billing entity as deleting, once: no free plan starts for it again. */
async function markDeleting(ctx: MutationCtx, entityId: string): Promise<void> {
  if (await ctx.db.query('billingDeletions').withIndex('entityId', q => q.eq('entityId', entityId)).first()) return
  await ctx.db.insert('billingDeletions', { entityId, at: Date.now() })
}

/**
 * Record a participant that used up its retries on the audit trail, for
 * administrators: the account is gone, so the row names none.
 */
async function recordFailure(ctx: MutationCtx, source: string, attempts: number): Promise<void> {
  const id = await ctx.db.insert('auditEvents', { type: 'account.erasure_failed', data: { source, attempts }, at: Date.now() })
  logBackend('info', 'audit.recorded', `account.erasure_failed ${id}`)
}

/**
 * The workspaces an account is the only owner of while others belong to
 * them: deleting the account would leave them without an owner, so it is
 * refused until ownership moves or the others leave.
 */
export const soleOwnerships = query({
  args: { userId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, { userId }) => soleOwned(ctx, userId),
})

async function soleOwned(ctx: QueryCtx, userId: string): Promise<string[]> {
  const blocked: string[] = []
  for (const member of await membershipsOf(ctx, userId)) {
    if (isOwner(member.role) && await leftWithoutOwner(ctx, member.organizationId, userId)) blocked.push(member.organizationId)
  }
  return blocked
}

/** How long a due deletion waits when the account became a workspace's only owner during its grace period: a day, then it checks again. */
const SOLE_OWNER_POSTPONE_MS = 24 * 60 * 60 * 1000

const vPlan = v.object({ deleted: v.array(v.string()), left: v.array(v.string()), email: v.optional(v.string()) })

/**
 * Start an account's erasure, or one by address for someone without an
 * account (`email` alone): every participant of the component's, in
 * batches, each scheduling the next. Returns the workspaces that go with
 * the account and the ones it leaves, and the address it erases by, which
 * the app's own part (the provider customers, the email contact) needs. Idempotent: run again for an account whose
 * erasure is under way, it returns the same plan; for one that stopped at
 * a failing participant, it resumes there.
 */
export const forget = mutation({
  args: { userId: v.optional(v.string()), email: v.optional(v.string()) },
  returns: vPlan,
  handler: async (ctx, { userId, email }) => {
    const address = email?.trim().toLowerCase() || undefined
    if (!userId && !address) throw backendError('invalid_input', { field: 'userId' }, '[nuxt-backend] account.forget: pass the account\'s `userId`, or the `email` of someone without an account.')
    return erase(ctx, userId, address)
  },
})

/** Start an erasure, or answer the plan of the one under way (a stopped one resumes). */
async function erase(ctx: MutationCtx, userId: string | undefined, address: string | undefined): Promise<typeof vPlan.type> {
  const running = userId
    ? await ctx.db.query('accountErasures').withIndex('userId', q => q.eq('userId', userId)).first()
    : await ctx.db.query('accountErasures').withIndex('email', q => q.eq('email', address)).first()
  return running ? await resume(ctx, running) : await start(ctx, userId, address)
}

/** How far ahead of its time a deletion may run, for the clock of a scheduled call that fires a moment early. */
const DUE_TOLERANCE_MS = 1000

/**
 * Start the erasure of an account whose deletion has waited out its grace
 * period; `null` when it has none (it was cancelled, or the account is
 * gone) or it is not due yet. The scheduled call at `deletesAt` runs this,
 * so a deletion cancelled meanwhile erases nothing. An erasure already under
 * way answers its plan. An account that became the only owner of a
 * workspace others belong to during its grace period is not erased, as its
 * deletion would have been refused: the deletion moves a day on
 * (`postponed` names the workspaces and the new `deletesAt`), and runs once
 * ownership moved or the others left.
 */
export const forgetDue = mutation({
  args: { userId: v.string() },
  returns: v.union(vPlan, v.null(), v.object({ postponed: v.array(v.string()), deletesAt: v.number() })),
  handler: async (ctx, { userId }) => {
    const running = await ctx.db.query('accountErasures').withIndex('userId', q => q.eq('userId', userId)).first()
    if (running) return resume(ctx, running)
    const deletion = await ctx.db.query('accountDeletions').withIndex('userId', q => q.eq('userId', userId)).first()
    if (!deletion || deletion.deletesAt > Date.now() + DUE_TOLERANCE_MS) return null
    const blocked = await soleOwned(ctx, userId)
    if (blocked.length > 0) {
      const deletesAt = Date.now() + SOLE_OWNER_POSTPONE_MS
      await ctx.db.patch('accountDeletions', deletion._id, { deletesAt })
      return { postponed: blocked, deletesAt }
    }
    return erase(ctx, userId, undefined)
  },
})

/** An erasure under way answers its plan; one that stopped at a failing participant runs again from it. */
async function resume(ctx: MutationCtx, running: Erasure): Promise<typeof vPlan.type> {
  if (running.failedAt !== undefined) {
    await ctx.db.patch('accountErasures', running._id, { attempts: 0, failedAt: undefined, error: undefined })
    await ctx.scheduler.runAfter(0, internal.account.sweep, { erasureId: running._id })
  }
  return { deleted: running.deleted, left: running.left, ...(running.email ? { email: running.email } : {}) }
}

/** Decide what goes with the account, mark its billing entities, and start the sweep. */
async function start(ctx: MutationCtx, userId: string | undefined, address: string | undefined): Promise<typeof vPlan.type> {
  const id = userId ? ctx.db.normalizeId('user', userId) : null
  const user = id ? await ctx.db.get('user', id) : null
  const plan = userId ? await planOf(ctx, userId) : { deleted: [], left: [] }
  // Before any provider call: a subscription that ends meanwhile starts no free plan.
  for (const entityId of entitiesOf({ userId, ...plan })) await markDeleting(ctx, entityId)
  // The address its email-keyed participants erase by: the one given, else the account's.
  const erasedEmail = address ?? user?.email.trim().toLowerCase()
  const erasureId = await ctx.db.insert('accountErasures', {
    ...(userId ? { userId } : {}),
    ...(erasedEmail ? { email: erasedEmail } : {}),
    ...plan,
    step: STEPS[0]!,
    attempts: 0,
    alias: pseudonym(),
    startedAt: Date.now(),
  })
  await ctx.scheduler.runAfter(0, internal.account.sweep, { erasureId })
  return { ...plan, ...(erasedEmail ? { email: erasedEmail } : {}) }
}

/** One batch of an erasure's current participant, run by `sweep` as a subtransaction of its own. */
export const batch = internalMutation({
  args: { erasureId: v.id('accountErasures') },
  returns: v.boolean(),
  handler: async (ctx, { erasureId }) => {
    const erasure = await ctx.db.get('accountErasures', erasureId)
    if (!erasure || !Object.hasOwn(ERASURE_PARTICIPANTS, erasure.step)) return false
    return ERASURE_PARTICIPANTS[erasure.step as Step](ctx, erasure)
  },
})

/**
 * Run one batch of an erasure; schedule the next until every participant
 * is done, then delete the erasure's row. A batch that throws rolls back
 * alone and runs again after a wait; after {@link ERASURE_ATTEMPTS} the
 * erasure stops at it (`account.erasure_failed`).
 */
export const sweep = internalMutation({
  args: { erasureId: v.id('accountErasures') },
  returns: v.null(),
  handler: async (ctx, { erasureId }) => {
    const erasure = await ctx.db.get('accountErasures', erasureId)
    if (!erasure || erasure.failedAt !== undefined) return null
    if (erasure.step === DONE) {
      await ctx.db.delete('accountErasures', erasureId)
      return null
    }
    let more: boolean
    try {
      more = await ctx.runMutation(internal.account.batch, { erasureId }, { transactionLimits: BATCH_TRANSACTION_LIMITS })
    }
    catch (error) {
      const attempts = erasure.attempts + 1
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 300)
      if (attempts < ERASURE_ATTEMPTS) {
        await ctx.db.patch('accountErasures', erasureId, { attempts, error: message })
        await ctx.scheduler.runAfter(ERASURE_RETRY_MS * 2 ** (attempts - 1), internal.account.sweep, { erasureId })
        return null
      }
      await ctx.db.patch('accountErasures', erasureId, { attempts, error: message, failedAt: Date.now() })
      logBackend('error', 'account.erasure_failed', `An account's erasure stopped at its ${erasure.step} participant after ${attempts} tries; run account.forget for the account again.`, error)
      await recordFailure(ctx, erasure.step, attempts)
      return null
    }
    if (!more) await ctx.db.patch('accountErasures', erasureId, { step: nextStep(erasure.step), attempts: 0, error: undefined })
    await ctx.scheduler.runAfter(0, internal.account.sweep, { erasureId })
    return null
  },
})

/**
 * A participant of the app's (the billing customer, the email contact, an
 * app's own source) used up its retries: logged, and recorded for
 * administrators.
 */
export const reportFailure = mutation({
  args: { source: v.string(), attempts: v.number() },
  returns: v.null(),
  handler: async (ctx, { source, attempts }) => {
    logBackend('error', 'account.erasure_failed', `An account's erasure gave up on its ${source} participant after ${attempts} tries; run its erasure again.`)
    await recordFailure(ctx, source, attempts)
    return null
  },
})

/** Whether a billing entity is being deleted by an account's erasure: the free plan starts nothing for it. */
export const isDeleting = query({
  args: { entityId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { entityId }) => Boolean(await ctx.db.query('billingDeletions').withIndex('entityId', q => q.eq('entityId', entityId)).first()),
})

/** Every erasure that stopped at a failing participant, oldest first: what an operator runs again. */
export const failedErasures = query({
  args: {},
  returns: v.array(v.object({ userId: v.union(v.string(), v.null()), step: v.string(), attempts: v.number(), error: v.union(v.string(), v.null()), failedAt: v.number() })),
  handler: async (ctx) => {
    const rows = await ctx.db.query('accountErasures').withIndex('failedAt', q => q.gt('failedAt', 0)).take(100)
    return rows.map(row => ({ userId: row.userId ?? null, step: row.step, attempts: row.attempts, error: row.error ?? null, failedAt: row.failedAt! }))
  },
})

// ── Deletion with a grace period ──────────────────────────────────────────

const vDeletion = v.object({ requestedAt: v.number(), deletesAt: v.number() })

/**
 * Schedule an account's deletion, or answer the one already scheduled: the
 * clock does not restart, but the keep token is replaced, so the email the
 * app sends again carries a link that works. `tokenHash` is the SHA-256 of
 * the token in the "keep my account" link.
 */
export const requestDeletion = mutation({
  args: { userId: v.string(), graceMs: v.number(), tokenHash: v.string() },
  returns: v.object({ ...vDeletion.fields, created: v.boolean() }),
  handler: async (ctx, { userId, graceMs, tokenHash }) => {
    const existing = await ctx.db.query('accountDeletions').withIndex('userId', q => q.eq('userId', userId)).first()
    if (existing) {
      await ctx.db.patch('accountDeletions', existing._id, { tokenHash })
      return { requestedAt: existing.requestedAt, deletesAt: existing.deletesAt, created: false }
    }
    const requestedAt = Date.now()
    const deletesAt = requestedAt + graceMs
    await ctx.db.insert('accountDeletions', { userId, requestedAt, deletesAt, tokenHash })
    return { requestedAt, deletesAt, created: true }
  },
})

/** The account's scheduled deletion, or `null`. */
export const deletion = query({
  args: { userId: v.string() },
  returns: v.union(vDeletion, v.null()),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db.query('accountDeletions').withIndex('userId', q => q.eq('userId', userId)).first()
    return row ? { requestedAt: row.requestedAt, deletesAt: row.deletesAt } : null
  },
})

/**
 * Cancel a scheduled deletion, by the account (its own call) or by the
 * token of the "keep my account" link (no sign-in). Answers the account it
 * kept, or `null` when nothing was scheduled, the link was used or the
 * account is already being erased. Once an erasure started there is nothing
 * to keep.
 */
export const cancelDeletion = mutation({
  args: { userId: v.optional(v.string()), tokenHash: v.optional(v.string()) },
  returns: v.union(v.object({ userId: v.string() }), v.null()),
  handler: async (ctx, { userId, tokenHash }) => {
    const row = tokenHash
      ? await ctx.db.query('accountDeletions').withIndex('tokenHash', q => q.eq('tokenHash', tokenHash)).first()
      : userId ? await ctx.db.query('accountDeletions').withIndex('userId', q => q.eq('userId', userId)).first() : null
    if (!row) return null
    if (await ctx.db.query('accountErasures').withIndex('userId', q => q.eq('userId', row.userId)).first()) return null
    await ctx.db.delete('accountDeletions', row._id)
    return { userId: row.userId }
  },
})

// ── Export ────────────────────────────────────────────────────────────────

/**
 * Count one export of the account's against its daily limit, before
 * anything is read: `rate_limited` (limit `accountExport`) once
 * {@link ACCOUNT_EXPORTS_PER_DAY} were made in the last day. Returns the
 * export's id and when its link will expire.
 */
export const startExport = mutation({
  args: { userId: v.string() },
  returns: v.object({ exportId: v.id('accountExports'), createdAt: v.number(), expiresAt: v.number() }),
  handler: async (ctx, { userId }) => {
    const now = Date.now()
    const recent = await ctx.db.query('accountExports').withIndex('userId_createdAt', q => q.eq('userId', userId).gt('createdAt', now - DAY_MS)).take(ACCOUNT_EXPORTS_PER_DAY)
    if (recent.length >= ACCOUNT_EXPORTS_PER_DAY) {
      const retryAfter = Math.max(0, recent[0]!.createdAt + DAY_MS - now)
      throw backendError('rate_limited', { limit: 'accountExport', retryAfter }, `[nuxt-backend] exportAccountData: ${ACCOUNT_EXPORTS_PER_DAY} exports a day; try again later.`)
    }
    const expiresAt = now + ACCOUNT_EXPORT_LINK_MS
    return { exportId: await ctx.db.insert('accountExports', { userId, createdAt: now, expiresAt }), createdAt: now, expiresAt }
  },
})

/** The account's funnel row (`null` before the funnel counted it) and the experiment variants it saw first. */
async function exportFunnel(ctx: QueryCtx, userId: string) {
  const person = await ctx.db.query('funnelPeople').withIndex('userId', q => q.eq('userId', userId)).unique()
  const exposures = await ctx.db.query('experimentExposures').withIndex('userId', q => q.eq('userId', userId)).take(MEMBERSHIPS_MAX)
  return {
    funnel: person ? exported(person) : null,
    experiments: exposures.map(({ experiment, variant, at }) => ({ experiment, variant, at })),
  }
}

/** A row as an export carries it: its own fields, without the store's. */
function exported<T extends { _id: unknown, _creationTime: unknown }>(row: T): Omit<T, '_id' | '_creationTime'> {
  const { _id, _creationTime, ...fields } = row
  return fields
}

/**
 * The gifts sent to an address that are its recipient's to see, as
 * `gifts.listByEmail` reads them (paid or claimed, and delivered): without
 * the purchaser's account, address and billing (entity, customer, order,
 * gift product, what they paid), or the claim discount.
 */
async function giftsReceived(ctx: QueryCtx, email: string) {
  const rows: Array<Doc<'billingGifts'>> = []
  for (const status of ['paid', 'claimed'] as const) {
    rows.push(...(await ctx.db.query('billingGifts').withIndex('recipientEmail_status', q => q.eq('recipientEmail', email).eq('status', status)).take(MEMBERSHIPS_MAX)).filter(isDelivered))
  }
  return rows.map(({ discountId: _discount, purchaserEmail: _email, purchaserUserId: _user, purchaserEntityId: _entity, billingCustomerId: _customer, billingOrderId: _order, giftProductId: _product, amount: _amount, currency: _currency, ...gift }) => exported(gift))
}

/**
 * What the component keeps of an account, for its export: the account,
 * its sessions, sign-in accounts and passkeys, its workspaces and
 * invitations, the gifts it bought and was sent, the billing
 * cache of its personal workspace (or of the account, billed on its own),
 * its own activity (the newest {@link EXPORT_ACTIVITY_MAX} events), and how
 * the growth funnel counts it (its row and the experiments' variants it saw),
 * with the workspaces it is the only member of (`ownedAlone`), whose
 * provider records the app adds.
 * Never a code, a token or a secret: what those rows hold is left out.
 */
export const exportData = query({
  args: { userId: v.string() },
  returns: v.any(),
  handler: async (ctx, { userId }) => {
    const id = ctx.db.normalizeId('user', userId)
    const user = id ? await ctx.db.get('user', id) : null
    if (!user) return null
    const email = user.email.trim().toLowerCase()
    const workspaces = await Promise.all((await membershipsOf(ctx, userId)).map(async (member) => {
      const workspaceId = ctx.db.normalizeId('organization', member.organizationId)
      const workspace = workspaceId ? await ctx.db.get('organization', workspaceId) : null
      return { id: member.organizationId, name: workspace?.name ?? null, slug: workspace?.slug ?? null, role: member.role, joinedAt: member.createdAt }
    }))
    const plan = await planOf(ctx, userId)
    const entities = entitiesOf({ userId, deleted: plan.deleted })
    return {
      account: exported(user),
      // The workspaces the account is the only member of: their billing records are the account's own.
      ownedAlone: plan.deleted,
      sessions: (await ctx.db.query('session').withIndex('userId', q => q.eq('userId', userId)).take(MEMBERSHIPS_MAX))
        .map(({ token: _token, ...session }) => exported(session)),
      signInMethods: (await ctx.db.query('account').withIndex('userId', q => q.eq('userId', userId)).take(MEMBERSHIPS_MAX))
        .map(({ accessToken: _a, refreshToken: _r, idToken: _i, password: _p, ...row }) => exported(row)),
      passkeys: (await ctx.db.query('passkey').withIndex('userId', q => q.eq('userId', userId)).take(MEMBERSHIPS_MAX))
        .map(({ publicKey: _key, credentialID: _credential, counter: _counter, ...passkey }) => exported(passkey)),
      workspaces,
      consents: await consentRows(ctx, userId),
      ...await inboundRows(ctx, userId),
      // The ticket that admitted the account (the redemption ledger), and its share code and referrals.
      accessTickets: (await ctx.db.query('accessRedemptions').withIndex('userId', q => q.eq('userId', userId)).take(MEMBERSHIPS_MAX)).map(({ inviteId: _invite, inviterId: _inviter, ...row }) => exported(row)),
      ...await referralRows(ctx, userId),
      invitationsSent: (await ctx.db.query('invitation').withIndex('inviterId', q => q.eq('inviterId', userId)).take(MEMBERSHIPS_MAX)).map(exported),
      invitationsReceived: (await ctx.db.query('invitation').withIndex('email', q => q.eq('email', email)).take(MEMBERSHIPS_MAX)).map(exported),
      // The recipient's own account and workspace ids are theirs, not the purchaser's, as the sent-gift listing keeps them.
      giftsBought: (await ctx.db.query('billingGifts').withIndex('purchaserUserId_createdAt', q => q.eq('purchaserUserId', userId)).take(MEMBERSHIPS_MAX))
        .map(({ discountId: _discount, claimedByUserId: _claimer, claimedEntityId: _claimed, claimingUserId: _claiming, claimingEntityId: _claimingEntity, ...gift }) => exported(gift)),
      giftsReceived: await giftsReceived(ctx, email),
      billing: (await Promise.all(entities.map(entityId => ctx.db.query('billingEntitlements').withIndex('userId', q => q.eq('userId', entityId)).first())))
        .filter(row => row !== null)
        .map(row => exported(row)),
      // A deletion waiting out its grace period, when there is one.
      deletion: await ctx.db.query('accountDeletions').withIndex('userId', q => q.eq('userId', userId)).first().then(row => row ? { requestedAt: row.requestedAt, deletesAt: row.deletesAt } : null),
      activity: (await ctx.db.query('auditEvents').withIndex('subjectId_at', q => q.eq('subjectId', userId)).order('desc').take(EXPORT_ACTIVITY_MAX)).map(exported),
      // How the growth funnel counts it: its attribution, its answer and the steps it reached; the variants it saw first.
      ...await exportFunnel(ctx, userId),
      // Its files, each with a link to its bytes, and the links it shared.
      ...await exportFiles(ctx, userId, plan.deleted),
      // The content it reported in a click, and the decisions on content it wrote, with their appeals.
      ...await reportRows(ctx, userId),
      // What the app told it, and whether it was read.
      ...await exportNotifications(ctx, userId),
      ...await exportPushSubscriptions(ctx, userId),
      ...await exportEmailPreferences(ctx, userId),
      // Its chat threads and the knowledge documents it added: the app reads
      // their messages and passages through each row's handle.
      chats: (await ctx.db.query('aiThreads').withIndex('userId', q => q.eq('userId', userId)).take(EXPORT_ACTIVITY_MAX))
        .map(({ _id, _creationTime, remove: _remove, ...thread }) => thread),
      knowledge: (await ctx.db.query('aiDocuments').withIndex('addedBy', q => q.eq('addedBy', userId)).take(EXPORT_ACTIVITY_MAX))
        .map(({ _id, _creationTime, remove: _remove, namespaces: _namespaces, removeNamespace: _removeNamespace, ...document }) => ({ id: _id, ...document })),
    }
  },
})

/** Store an export's file once it is written, and schedule its deletion for when its link expires. */
export const attachExport = internalMutation({
  args: { exportId: v.id('accountExports'), storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { exportId, storageId }) => {
    const row = await ctx.db.get('accountExports', exportId)
    if (!row) {
      await ctx.storage.delete(storageId)
      return null
    }
    await ctx.db.patch('accountExports', exportId, { storageId })
    await ctx.scheduler.runAt(row.expiresAt, internal.account.expireExport, { exportId })
    return null
  },
})

/** An export's link expired: its file is deleted; the row stays a day, which the limit counts. */
export const expireExport = internalMutation({
  args: { exportId: v.id('accountExports') },
  returns: v.null(),
  handler: async (ctx, { exportId }) => {
    const row = await ctx.db.get('accountExports', exportId)
    if (!row) return null
    for (const part of await ctx.db.query('accountExportParts').withIndex('exportId', q => q.eq('exportId', exportId)).take(EXPORT_PARTS_MAX)) {
      await ctx.storage.delete(part.storageId)
      await ctx.db.delete('accountExportParts', part._id)
    }
    if (!row.storageId) return null
    await ctx.storage.delete(row.storageId)
    await ctx.db.patch('accountExports', exportId, { storageId: undefined })
    return null
  },
})

/** Keep a zip part of an export's files, and delete it with the export's file. */
export const attachPart = internalMutation({
  args: { exportId: v.id('accountExports'), storageId: v.id('_storage'), bytes: v.number(), files: v.number() },
  returns: v.null(),
  handler: async (ctx, { exportId, storageId, bytes, files }) => {
    const row = await ctx.db.get('accountExports', exportId)
    if (!row) {
      await ctx.storage.delete(storageId)
      return null
    }
    await ctx.db.insert('accountExportParts', { exportId, userId: row.userId, storageId, bytes, files, createdAt: Date.now() })
    return null
  },
})

/** One zip part of an export's files: its link and size, and the names of the entries it holds. */
const vPart = v.object({ url: v.string(), bytes: v.number(), files: v.array(v.string()) })

/** One zip part as an export's status lists it: its link, size and number of files. */
const vPartStatus = v.object({ url: v.string(), bytes: v.number(), files: v.number() })

/**
 * Bundle an export's files into zip parts of at most {@link PART_BYTES}
 * of input each, written to the component's storage and linked like the
 * export's own file: they work until the export's link expires, and go
 * with it. A file that is gone, or bigger than {@link BUNDLE_FILE_MAX}, is
 * left out of every part (it keeps its own link in the export). Stored
 * without compression: uploads are mostly images, which are compressed.
 */
export const bundleFiles = action({
  args: { exportId: v.id('accountExports'), files: v.array(v.object({ storageId: v.string(), name: v.string(), size: v.number() })) },
  returns: v.array(vPart),
  handler: async (ctx, { exportId, files }) => {
    const parts: Array<typeof vPart.type> = []
    let entries: Record<string, Uint8Array> = {}
    let names: string[] = []
    let bytes = 0
    const flush = async () => {
      if (names.length === 0) return
      const zip = zipSync(entries, { level: 0 })
      const storageId = await ctx.storage.store(new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
      await ctx.runMutation(internal.account.attachPart, { exportId, storageId, bytes: zip.byteLength, files: names.length })
      const url = await ctx.storage.getUrl(storageId)
      if (url) parts.push({ url, bytes: zip.byteLength, files: names })
      entries = {}
      names = []
      bytes = 0
    }
    for (const file of files) {
      if (parts.length >= EXPORT_PARTS_MAX) break
      if (file.size > BUNDLE_FILE_MAX) continue
      const blob = await ctx.storage.get(file.storageId as Id<'_storage'>)
      if (!blob) continue
      const data = new Uint8Array(await blob.arrayBuffer())
      if (bytes > 0 && bytes + data.byteLength > PART_BYTES) await flush()
      entries[file.name] = data
      names.push(file.name)
      bytes += data.byteLength
    }
    await flush()
    return parts
  },
})

/**
 * Write an export's file into the component's storage, apart from the
 * app's own files, and answer its link, which works until the file is
 * deleted ({@link ACCOUNT_EXPORT_LINK_MS}). `data` is the export as JSON.
 */
export const storeExport = action({
  args: { exportId: v.id('accountExports'), data: v.string() },
  returns: v.union(v.object({ url: v.string() }), v.null()),
  handler: async (ctx, { exportId, data }) => {
    const storageId = await ctx.storage.store(new Blob([data], { type: 'application/json' }))
    await ctx.runMutation(internal.account.attachExport, { exportId, storageId })
    const url = await ctx.storage.getUrl(storageId)
    return url ? { url } : null
  },
})

/**
 * The account's exports: the newest whose link still works (its link, and
 * when it was made and expires; `null` for none), and how many more it may
 * make in the day the limit counts.
 */
export const exportStatus = query({
  args: { userId: v.string() },
  returns: v.object({
    latest: v.union(v.object({ url: v.string(), createdAt: v.number(), expiresAt: v.number(), parts: v.array(vPartStatus) }), v.null()),
    remaining: v.number(),
  }),
  handler: async (ctx, { userId }) => {
    const now = Date.now()
    const recent = await ctx.db.query('accountExports').withIndex('userId_createdAt', q => q.eq('userId', userId).gt('createdAt', now - DAY_MS)).order('desc').take(ACCOUNT_EXPORTS_PER_DAY)
    const remaining = Math.max(0, ACCOUNT_EXPORTS_PER_DAY - recent.length)
    for (const row of recent) {
      if (!row.storageId || row.expiresAt <= now) continue
      const url = await ctx.storage.getUrl(row.storageId)
      if (!url) continue
      const parts: Array<typeof vPartStatus.type> = []
      for (const part of await ctx.db.query('accountExportParts').withIndex('exportId', q => q.eq('exportId', row._id)).take(EXPORT_PARTS_MAX)) {
        const partUrl = await ctx.storage.getUrl(part.storageId)
        if (partUrl) parts.push({ url: partUrl, bytes: part.bytes, files: part.files })
      }
      return { latest: { url, createdAt: row.createdAt, expiresAt: row.expiresAt, parts }, remaining }
    }
    return { latest: null, remaining }
  },
})
