import { actionGeneric, type FunctionReference, type GenericActionCtx, type GenericDataModel, type GenericMutationCtx, type GenericQueryCtx, internalActionGeneric, makeFunctionReference, mutationGeneric, queryGeneric, type RegisteredAction, type RegisteredMutation, type RegisteredQuery, type Scheduler } from 'convex/server'
import { v } from 'convex/values'
import { AGE_KIND, ageVersion, assertDeclarations, type ConsentDeclaration, type ConsentDeclarations, encodeStorage, isCurrent, parseStorage, readAge, requiredKinds, STORAGE_KIND, STORAGE_PURPOSES, type StoragePurpose } from '../consent-rules.js'
import { ERASE_ACCOUNT_FUNCTION } from '../constants.js'
import { type BackendPaths, resolveBackendPaths } from '../paths.js'
import { readEnv } from '../delivery.js'
import { backendError } from '../errors.js'
import { logBackend } from '../log.js'
import { normalizeEmail, randomToken, sha256Hex } from '../tokens.js'
import { expandAiExport } from './ai/account-export.js'
import { callerRefusal, ownCaller } from './access.js'
import { type Audit, type AuditCtx, setupAudit } from './audit.js'
import type { AccountBillingErasure, AccountBillingExport } from './billing/types/surface.js'
import type { Email } from './email.js'
import type { EmailTemplateData } from '../email-templates.js'

// Export and complete erasure of an account, for the app: one file with
// everything the package and the app keep of a person, behind a link that
// expires, and an erasure that runs every participant of the registry, the
// component's own tables, the providers' records and the app's own tables,
// until nothing of the account is left.

/** The consents an app declares, and the purposes of optional storage the consent manager asks about. */
export type { ConsentDeclaration, ConsentDeclarations, StorageChoice, StoragePurpose } from '../consent-rules.js'

/** The registry of what the package keeps of a person, which the Privacy and data inventory page lists. */
export { ACCOUNT_DATA_SOURCES } from '../account-data.js'
export type { AccountDataRecord, AccountDataSourceKey, ErasureAction, ErasureKey } from '../account-data.js'

/** How many times a participant of the app's runs in a row before the erasure gives up on it. */
const ERASURE_ATTEMPTS = 5

/** The wait before a participant's first retry; each next one waits twice as long. */
const ERASURE_RETRY_MS = 10_000

/** How long a deletion waits before it runs, unless `graceMs` says otherwise: 30 days. */
const DEFAULT_GRACE_MS = 30 * 24 * 60 * 60 * 1000

/** The most batches one run of an app's source erases, before the run goes on to the next. */
const SOURCE_BATCHES_MAX = 1000

/**
 * One of your own tables (or anything else you keep of a person), joining
 * export and erasure: what it holds, the internal query that reads its rows
 * of an account for an export, and the internal mutation that erases them.
 *
 * @example
 * ```ts [backend/account.ts]
 * export const account = setupAccount(components, {
 *   billing,
 *   email,
 *   sources: {
 *     todos: {
 *       description: 'The to-dos the account wrote.',
 *       export: internal.todos.exportFor,
 *       forget: internal.todos.forgetFor,
 *     },
 *   },
 * })
 * ```
 */
export interface AccountDataSource {
  /** What it holds of a person, in a sentence. */
  description: string
  /**
   * Your internal query that reads its rows of one account for an export,
   * as any JSON value: `{ userId }`. The export carries it under the
   * source's key.
   */
  export?: FunctionReference<'query', 'internal', { userId: string }, unknown>
  /**
   * Your internal mutation that erases one batch of its rows: of the
   * account (`userId`) and of the address (`email`), or of the address
   * alone for someone without an account. Answer `{ done: false }` while
   * rows are left, and it runs again; anything else is done. It may run
   * more than once for the same account: make it idempotent.
   */
  forget?: FunctionReference<'mutation', 'internal', { userId?: string, email?: string }, { done: boolean } | null>
}

/** What `setupAccount` takes: the instances whose records it erases and exports, and your own sources. */
export interface SetupAccountOptions {
  /** Your `setupBilling` instance: the provider customers of the account's billing entities are deleted with it, and their orders exported. */
  billing?: { forgetAccount: AccountBillingErasure, exportAccount: AccountBillingExport }
  /**
   * Your `setupEmail` instance: the address's contact at the email provider
   * is removed, and the emails of a scheduled and a cancelled deletion go
   * through it. Without it a deletion is still scheduled, but nothing is
   * emailed (`account.deletion_email_unsent`).
   */
  email?: { forgetContact: (email: string) => Promise<void>, sendTemplate?: Email['sendTemplate'] }
  /**
   * How long a deletion waits before the account is erased, in
   * milliseconds, during which the person can keep it. Default 30 days. An
   * administrator's removal skips it.
   */
  graceMs?: number
  /**
   * The app's paths, from the `paths.generated.ts` the Nuxt module writes
   * from nuxt.config: `keepAccount` is the page the "keep my account" link
   * opens, `{SITE_URL}{paths.keepAccount}?token=…` (`pages.keepAccount`,
   * default `/account/keep`).
   */
  paths?: Partial<BackendPaths>
  /** Your `setupAudit` instance: an export is recorded through it (`account.data_exported`); without it, on the component's own trail. */
  audit?: Pick<Audit, 'recordBackendEvent'>
  /** Your own tables, by a key of yours: what each holds, and how it is exported and erased. */
  sources?: Record<string, AccountDataSource>
  /**
   * The documents and opt-ins people agree to, by kind, each with its
   * version: `{ terms: { version: '2026-10-01', url: '/terms', required: true } }`.
   * Sign-up records each required kind at its current version; raising a
   * version asks everyone again (`<ConsentPrompt>`). `account.consented`
   * reads one where it gates what your app does with someone's data.
   */
  consents?: ConsentDeclarations
  /**
   * The youngest age an account may be. A new account is asked its age once,
   * after its first sign-in code, and refused under it (`forbidden`, reason
   * `under_age`); no age is kept, only that the person passed this minimum.
   * Raising it asks existing accounts again. Self-declared, with no
   * parental-consent flow.
   */
  minimumAge?: number
}

/** Where an account is in the first run at `/welcome`. */
export interface OnboardingState {
  /** When the account finished or skipped it, epoch ms; `null` while it has not. */
  onboardedAt: number | null
}

/** The context an account's consent functions run in: a mutation's or an action's. */
export type AccountConsentCtx = Pick<GenericMutationCtx<GenericDataModel>, 'runQuery' | 'runMutation'>

/**
 * What `setupAuth` reads of the account at sign-up: the minimum age to ask
 * a new account, and the writer that records what it agreed to. Pass the
 * whole `setupAccount` instance as `setupAuth({ account })`; nothing else
 * calls it.
 */
export interface AccountGate {
  /** The youngest age a new account may be; `undefined` when the app sets none. */
  minimumAge: number | undefined
  /**
   * An account was created: the consents its address gave before move to it,
   * every required kind is recorded at its current version, and the age
   * check is recorded at the minimum. Each recorded decision lands on the
   * activity trail. Safe to run again.
   */
  signUp: (ctx: AccountConsentCtx, input: { userId: string, email: string, agreed?: boolean }) => Promise<void>
}

/** One kind of the app's, as the caller reads it. */
export interface ConsentView {
  kind: string
  /** The latest version the app declares. */
  version: string
  url?: string
  title?: string
  required: boolean
  /** The version the caller agreed to, `null` when they never did or withdrew it. */
  grantedVersion: string | null
  grantedAt: number | null
  /** `true` when they agreed to the latest version. */
  current: boolean
}

/** The required consents of an app, as a sign-in form names them. */
export interface ConsentTerms {
  /** The required kinds, in the order the app declares them. */
  terms: Array<{ kind: string, version: string, url?: string, title?: string }>
  /** The minimum age the app sets, `null` for none. */
  minimumAge: number | null
}

/** What a signed-in person has agreed to, against what the app declares now. */
export interface ConsentsView {
  consents: ConsentView[]
  /** The required kinds not yet accepted at their latest version, with `age` when the minimum age was raised or never answered. */
  missing: string[]
  /** The purposes of optional storage the caller allowed, `null` when they never chose. */
  storage: StoragePurpose[] | null
  /** The minimum age the app sets, `null` for none. */
  minimumAge: number | null
}

/** One zip of an export's files: its link, its size in bytes and how many files it holds. */
export interface AccountExportPart {
  url: string
  bytes: number
  files: number
}

/** An export: its link, when it was made and when the link stops working (epoch ms), and the zip parts that bundle the account's files. */
export interface AccountExport {
  url: string
  createdAt: number
  expiresAt: number
  /** The account's files as zip parts, behind links that stop working with the export's; empty without files. */
  parts: AccountExportPart[]
}

/** A deletion waiting out its grace period: when it was asked for, and when the account is erased unless it is kept (epoch ms). */
export interface AccountDeletion {
  requestedAt: number
  deletesAt: number
}

/** The account's exports: the newest whose link still works, and how many more it may make today. */
export interface AccountExportStatus {
  /** The newest export whose link still works; `null` for none. */
  latest: AccountExport | null
  /** How many more exports the account may make in the day the limit counts (three a day). */
  remaining: number
}

/**
 * What an erasure decided: the workspaces that go with the account (its
 * personal one and any it was the only member of) and the ones it leaves,
 * and the address it erases by.
 */
export interface AccountErasurePlan {
  deleted: string[]
  left: string[]
  email?: string
}

/** Who an erasure is for: an account, by its id, or someone without one, by address. */
export interface AccountErasureTarget {
  userId?: string
  email?: string
}

/** The context an erasure starts from: a mutation's or an action's. */
export type AccountWriteCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation'> & { scheduler: Scheduler }

/** The context a read takes: any function's. */
export type AccountReadCtx = Pick<GenericQueryCtx<GenericDataModel>, 'runQuery'>

/** One participant of the app's part of an erasure: its name, and what it runs. */
type Participant = [name: string, run: (ctx: GenericActionCtx<GenericDataModel>) => Promise<void>]

/** The arguments the app's part of an erasure runs with, carried from one retry to the next, or the account whose grace period ended. */
type ErasureArgs = typeof vErasureArgs.type

const vErasureArgs = v.object({
  userId: v.optional(v.string()),
  email: v.optional(v.string()),
  /** The workspaces that go with the account, and the ones it leaves: absent in the call scheduled for the end of a grace period. */
  deleted: v.optional(v.array(v.string())),
  left: v.optional(v.array(v.string())),
  /** The participants that finished, which a retry skips. */
  done: v.optional(v.array(v.string())),
  /** This run's attempt, from 1. */
  attempt: v.optional(v.number()),
  /** The call scheduled for the end of a grace period: the account to erase unless its deletion was cancelled. */
  due: v.optional(v.string()),
})

const vPart = v.object({ url: v.string(), bytes: v.number(), files: v.number() })
const vExport = v.object({ url: v.string(), createdAt: v.number(), expiresAt: v.number(), parts: v.array(vPart) })
const vDeletion = v.object({ requestedAt: v.number(), deletesAt: v.number() })
const vExportStatus = v.object({ latest: v.union(vExport, v.null()), remaining: v.number() })

/** Export and complete erasure for one app, from {@link setupAccount}. */
export interface Account {
  /** The functions `backend/account.ts` re-exports, behind `useAccount` and `<AccountData>`. */
  api: {
    /**
     * Export the caller's data: everything the package keeps of the
     * account, its billing records at the provider and your own sources,
     * in one JSON file behind a link that expires within the hour. At most
     * three a day (`rate_limited`, limit `accountExport`); refused to an
     * administrator impersonating the account (`forbidden`).
     */
    exportAccountData: RegisteredAction<'public', Record<string, never>, Promise<AccountExport>>
    /**
     * The caller's exports: the newest whose link still works, and how many
     * more they may make today. `null` for nobody signed in and an
     * administrator acting as the account.
     */
    getAccountExport: RegisteredQuery<'public', Record<string, never>, Promise<AccountExportStatus | null>>
    /**
     * The caller's deletion waiting out its grace period, live: when it
     * was asked for and when the account is erased. `null` for none, for
     * nobody signed in and for an administrator acting as the account.
     */
    getAccountDeletion: RegisteredQuery<'public', Record<string, never>, Promise<AccountDeletion | null>>
    /**
     * Cancel a scheduled deletion and keep the account; a second email
     * confirms. With no argument it is the signed-in caller's own (refused to
     * an administrator acting as the account). With the `token` of the "keep
     * my account" link it needs no sign-in. Resolves with whether a deletion
     * was cancelled: `false` when none was scheduled, or the link was used
     * or replaced by a newer one.
     */
    cancelAccountDeletion: RegisteredMutation<'public', { token?: string }, Promise<boolean>>
    /**
     * Internal: the app's part of an erasure (the billing customers, the
     * email contact, your own sources), retried with a growing wait, and
     * the call scheduled for the end of a grace period, which starts the
     * erasure unless the deletion was cancelled.
     * Exported from `backend/account.ts`, where an erasure finds it by name.
     */
    eraseAccountData: RegisteredAction<'internal', ErasureArgs, Promise<null>>
    /**
     * What the caller agreed to, against what `consents` declares now: each
     * kind with its latest version and whether they accepted it, the
     * required kinds they have not (`missing`), the optional storage they
     * allowed and the minimum age. `null` for nobody signed in and an
     * administrator acting as the account.
     */
    getConsents: RegisteredQuery<'public', Record<string, never>, Promise<ConsentsView | null>>
    /**
     * The required kinds an app declares, with their versions and links, for
     * the agreement line of a sign-in form. Nothing about a person, so it
     * answers anyone, signed in or not, with `minimumAge` beside it.
     */
    getConsentTerms: RegisteredQuery<'public', Record<string, never>, Promise<ConsentTerms>>
    /**
     * The caller agrees to a declared kind at its latest version, or passes
     * the age check (`kind: 'age'` with the `age` typed, which is never
     * kept). Refused to an administrator acting as the account
     * (`forbidden`, `impersonating`), for a kind `consents` doesn't declare
     * (`invalid_input`, field `kind`) and for an age under `minimumAge`
     * (`forbidden`, `under_age`).
     */
    grantConsent: RegisteredMutation<'public', { kind: string, age?: number, source?: 'prompt' | 'settings' }, Promise<null>>
    /**
     * The caller withdraws a consent they gave. A required kind can't be
     * withdrawn (`invalid_input`, field `kind`, reason `required`).
     */
    withdrawConsent: RegisteredMutation<'public', { kind: string }, Promise<null>>
    /**
     * The caller chooses which optional storage to allow: the purposes
     * (`preferences`, `replay`, `analytics`) they allow, and none for
     * declining all. Joins their ledger as kind `storage`.
     */
    chooseStorage: RegisteredMutation<'public', { purposes: string[], source?: 'prompt' | 'settings' }, Promise<null>>
    /**
     * Whether the caller finished or skipped the first run at `/welcome`:
     * `{ onboardedAt }`, epoch ms, or `null` while they have not. `null`
     * when nobody is signed in. An administrator's visit reads the account's
     * own state. Read by `useOnboarding`, and by the one redirect that leads
     * a new account to `/welcome`.
     */
    getOnboarding: RegisteredQuery<'public', Record<string, never>, Promise<OnboardingState | null>>
    /**
     * The caller finished or skipped the first run: stamps `onboardedAt`
     * once, and keeps the first time on a second call. Refused as `forbidden`
     * (reason `impersonating`) for an administrator's visit.
     */
    completeOnboarding: RegisteredMutation<'public', Record<string, never>, Promise<OnboardingState>>
  }
  /**
   * Erase an account completely, or someone without one by address: the
   * component's tables in batches, then the providers' records and your
   * own sources, each retried, until nothing is left. The account's own
   * deletion (`/delete-user`, `/admin/remove-user`) runs it once
   * `setupAuth` gets this instance as `account`; call it yourself to
   * delete an account from server code, which deletes the account itself
   * too. Refuse it first for an owner whose workspaces would be left
   * without one ({@link Account.soleOwnerships}).
   *
   * @guarantee
   * - Runs: in the caller's transaction (the component's start), then in transactions and actions of its own
   * - Delivery: every participant until it is done; a failing one is retried five times with a growing wait, then logged as `account.erasure_failed` and recorded for administrators
   * - Order: the component's participants in the registry's order; the app's after it started, in parallel to them
   * - When it throws: only when the erasure can't start; nothing is erased then
   * - Idempotency: safe to repeat; an erasure under way returns its plan, a stopped one resumes
   */
  forget: (ctx: AccountWriteCtx, target: AccountErasureTarget) => Promise<AccountErasurePlan>
  /**
   * Erase someone without an account, by address: the invitations, gifts
   * and mail held for it, its contact at the email provider and your own
   * sources' rows of it. Refuses an address an account holds (`invalid_input`,
   * reason `has_account`): delete that account instead.
   */
  forgetEmail: (ctx: AccountWriteCtx, email: string) => Promise<void>
  /**
   * Schedule an account's deletion, as `/delete-user` does after the person
   * confirmed: the account works as before until `graceMs` passed, its
   * address gets an email with the "keep my account" link, and the erasure
   * runs at the end unless it is cancelled. Asking again keeps the date and
   * sends a new link. It checks nothing: refuse the only owner of a
   * workspace others belong to first ({@link Account.soleOwnerships}).
   *
   * @guarantee
   * - Runs: in the caller's transaction, and schedules the erasure for the end of the grace period
   * - Delivery: the email is best effort (`account.deletion_email_unsent`); the deletion stands without it
   * - Idempotency: safe to repeat; the date does not move
   */
  scheduleDeletion: (ctx: AccountWriteCtx, userId: string) => Promise<AccountDeletion>
  /**
   * Cancel an account's scheduled deletion from server code, with the
   * confirmation email. Resolves with whether one was scheduled.
   */
  cancelDeletion: (ctx: AccountWriteCtx, userId: string) => Promise<boolean>
  /**
   * The workspaces the account is the only owner of while others belong
   * to them: its deletion is refused (`forbidden`, reason `sole_owner`)
   * while any is left.
   */
  soleOwnerships: (ctx: AccountReadCtx, userId: string) => Promise<string[]>
  /**
   * Whether the account agreed to the latest version of a kind: `true` only
   * when it was granted at that version and not withdrawn since. Read it
   * where a consent gates what your app does with someone's data. A kind
   * `consents` doesn't declare is `invalid_input` (field `kind`), so a typo
   * fails loudly instead of reading `false`.
   */
  consented: (ctx: AccountReadCtx, input: { userId: string, kind: string }) => Promise<boolean>
  /**
   * Refuse an account that has not accepted every required kind at its
   * latest version (`forbidden`, reason `consent_required`, with the `kind`
   * missing), or the kinds named. Call it first in a function that must not
   * run before the terms are accepted.
   */
  requireConsent: (ctx: AccountReadCtx, input: { userId: string, kinds?: string[] }) => Promise<void>
  /** What `setupAuth` reads at sign-up: pass the whole instance as `setupAuth({ account })`. */
  gate: AccountGate
  /**
   * The page the "keep my account" link opens, as resolved from `paths`
   * (`pages.keepAccount`). `setupAuth({ account })` reports it through
   * `auth:authConfig`, so `doctor`'s `page-paths` compares the path the
   * link really uses with nuxt.config.
   */
  keepPath: string
}

/** The `backend` component as export and erasure read it. */
export interface AccountComponents {
  backend: unknown
}

interface AccountRefs {
  account: {
    forget: FunctionReference<'mutation', 'internal', { userId?: string, email?: string }, AccountErasurePlan>
    reportFailure: FunctionReference<'mutation', 'internal', { source: string, attempts: number }, null>
    soleOwnerships: FunctionReference<'query', 'internal', { userId: string }, string[]>
    requestDeletion: FunctionReference<'mutation', 'internal', { userId: string, graceMs: number, tokenHash: string }, AccountDeletion & { created: boolean }>
    deletion: FunctionReference<'query', 'internal', { userId: string }, AccountDeletion | null>
    cancelDeletion: FunctionReference<'mutation', 'internal', { userId?: string, tokenHash?: string }, { userId: string } | null>
    forgetDue: FunctionReference<'mutation', 'internal', { userId: string }, AccountErasurePlan | { postponed: string[], deletesAt: number } | null>
    bundleFiles: FunctionReference<'action', 'internal', { exportId: string, files: Array<{ storageId: string, name: string, size: number }> }, Array<{ url: string, bytes: number, files: string[] }>>
    startExport: FunctionReference<'mutation', 'internal', { userId: string }, { exportId: string, createdAt: number, expiresAt: number }>
    exportData: FunctionReference<'query', 'internal', { userId: string }, (Record<string, unknown> & { ownedAlone: string[] }) | null>
    storeExport: FunctionReference<'action', 'internal', { exportId: string, data: string }, { url: string } | null>
    exportStatus: FunctionReference<'query', 'internal', { userId: string }, AccountExportStatus>
  }
  consents: {
    record: FunctionReference<'mutation', 'internal', { userId: string, entries: ConsentEntry[] }, ConsentEntry[]>
    recordSignUp: FunctionReference<'mutation', 'internal', { userId: string, email: string, entries: ConsentEntry[] }, { carried: Array<{ kind: string, version: string, granted: boolean, at: number }>, recorded: ConsentEntry[] }>
    state: FunctionReference<'query', 'internal', { userId: string }, ConsentDecisionRow[]>
    latest: FunctionReference<'query', 'internal', { userId: string, kind: string }, ConsentDecisionRow | null>
  }
  onboarding: {
    marks: FunctionReference<'query', 'internal', { userId: string }, { onboardedAt: number | null, activationDismissedAt: number | null }>
    complete: FunctionReference<'mutation', 'internal', { userId: string }, number | null>
  }
  adapter: { findOne: FunctionReference<'query', 'internal', { model: string, where: Array<{ field: string, value: string }> }, unknown> }
}

/** A decision as the ledger writes it. */
interface ConsentEntry { kind: string, version: string, granted: boolean, source: string, text?: string }

/** A kind's latest decision as the ledger answers it. */
interface ConsentDecisionRow { kind: string, version: string, granted: boolean, at: number }

/** Whether the age row of an account stands for `minimumAge`: it passed that minimum or a higher one. */
function ageCurrent(decision: ConsentDecisionRow | null | undefined, minimumAge: number): boolean {
  return Boolean(decision?.granted && Number(decision.version) >= minimumAge)
}

/** The file extensions of the types an app mostly stores. */
const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/json': 'json',
  'text/plain': 'txt',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
}

/** The name a file has inside a zip part: its storage id and the extension of its type, in a `files` folder. */
function entryName(file: { storageId: string, contentType: string | null }): string {
  return `files/${file.storageId}.${EXTENSIONS[file.contentType ?? ''] ?? 'bin'}`
}

/** A file as the component's export lists it. */
interface ExportedFile {
  storageId: string
  contentType: string | null
  size: number
  url: string | null
  [field: string]: unknown
}

/**
 * Export and complete erasure of an account. `functions` holds the export
 * the account page calls (`useAccount`, `<AccountData>`) and the app's
 * part of an erasure; `forget` erases an account, or someone without one by
 * address; `soleOwnerships` says whose deletion would leave a workspace
 * without an owner. Pass the instance to `setupAuth({ account })`, so an
 * account's own deletion erases everything.
 *
 * @example
 * ```ts [backend/account.ts]
 * import { setupAccount } from 'nuxt-backend/account'
 * import { components } from './_generated/api'
 * import { audit } from './audit'
 * import { billing } from './billing'
 * import { email } from './email'
 *
 * export const account = setupAccount(components, { billing, email, audit })
 * export const { exportAccountData, getAccountExport, eraseAccountData } = account.api
 * ```
 */
export function setupAccount(components: AccountComponents, options: SetupAccountOptions = {}): Account {
  assertDeclarations(options.consents, 'setupAccount({ consents })')
  const { minimumAge } = options
  if (minimumAge !== undefined && (!Number.isInteger(minimumAge) || minimumAge < 1 || minimumAge > 99)) {
    throw new Error('[nuxt-backend] setupAccount({ minimumAge }): pass a whole number of years from 1 to 99.')
  }
  const declared = options.consents ?? {}
  const refs = components.backend as AccountRefs
  const sources = Object.entries(options.sources ?? {})
  const backend = components.backend as { audit?: unknown, adapter?: unknown }
  const trail = options.audit ?? (backend.audit && backend.adapter ? setupAudit(components) : undefined)
  // The scaffold's `eraseAccountData`, by the module name every account function goes by.
  const eraseByName = makeFunctionReference<'action', ErasureArgs>(ERASE_ACCOUNT_FUNCTION) as unknown as FunctionReference<'action', 'internal', ErasureArgs>
  const appPart = Boolean(options.billing || options.email || sources.some(([, source]) => source.forget))

  /** The app's participants of one erasure, by name, in the order they run. */
  const participantsOf = (args: ErasureArgs): Participant[] => {
    const { userId, email } = args
    const deleted = args.deleted ?? []
    const left = args.left ?? []
    const participants: Participant[] = []
    const { billing, email: mail } = options
    if (billing && userId) participants.push(['billingCustomer', ctx => billing.forgetAccount(ctx, { userId, deleted, left })])
    if (mail && email) participants.push(['emailContact', () => mail.forgetContact(email)])
    for (const [key, source] of sources) {
      const forgetSource = source.forget
      if (!forgetSource) continue
      participants.push([`app:${key}`, async (ctx) => {
        for (let batch = 0; batch < SOURCE_BATCHES_MAX; batch++) {
          const answer = await ctx.runMutation(forgetSource, { ...(userId ? { userId } : {}), ...(email ? { email } : {}) })
          if ((answer as { done?: unknown } | null | undefined)?.done !== false) return
        }
        throw new Error(`the ${key} source answered "not done" ${SOURCE_BATCHES_MAX} times in a row`)
      }])
    }
    return participants
  }

  /** The end of a grace period: erase the account unless its deletion was cancelled meanwhile. */
  const finishDue = async (ctx: AccountWriteCtx, userId: string): Promise<null> => {
    const plan = await ctx.runMutation(refs.account.forgetDue, { userId })
    if (plan && 'postponed' in plan) {
      // It became the only owner of a workspace others belong to: erasing it now would leave them without one.
      await ctx.scheduler.runAt(plan.deletesAt, eraseByName, { due: userId })
      logBackend('warn', 'account.deletion_postponed', `An account's deletion waits a day: it is the only owner of ${plan.postponed.length} workspace(s) others belong to.`)
      return null
    }
    if (plan) await startAppPart(ctx, { userId, ...(plan.email ? { email: plan.email } : {}), deleted: plan.deleted, left: plan.left })
    return null
  }

  const eraseAccountData = internalActionGeneric({
    args: vErasureArgs,
    returns: v.null(),
    handler: async (ctx, args): Promise<null> => {
      if (args.due !== undefined) return finishDue(ctx, args.due)
      const done = new Set(args.done ?? [])
      const attempt = args.attempt ?? 1
      for (const [source, run] of participantsOf(args)) {
        if (done.has(source)) continue
        try {
          await run(ctx)
          done.add(source)
        }
        catch (error) {
          if (attempt < ERASURE_ATTEMPTS) {
            // Every participant is idempotent; the ones done are skipped.
            await ctx.scheduler.runAfter(ERASURE_RETRY_MS * 2 ** (attempt - 1), eraseByName, { ...args, done: [...done], attempt: attempt + 1 })
            logBackend('warn', 'account.erasure_retried', `An account's erasure will run its ${source} participant again (attempt ${attempt} failed).`, error)
            return null
          }
          logBackend('error', 'account.erasure_failed', `An account's erasure gave up on its ${source} participant after ${attempt} tries; run its erasure again.`, error)
          await ctx.runMutation(refs.account.reportFailure, { source, attempts: attempt })
          done.add(source)
        }
      }
      return null
    },
  })

  /** Start the app's part of an erasure by its function's name, never failing the component's part, which has started. */
  const startAppPart = async (ctx: AccountWriteCtx, args: ErasureArgs): Promise<void> => {
    if (!appPart) return
    try {
      await ctx.scheduler.runAfter(0, eraseByName, args)
    }
    catch (error) {
      logBackend('error', 'account.erasure_failed', `An account's erasure could not start its providers' and the app's part: backend/account.ts must export eraseAccountData (\`${ERASE_ACCOUNT_FUNCTION}\`).`, error)
    }
  }

  const forget: Account['forget'] = async (ctx, target) => {
    const plan = await ctx.runMutation(refs.account.forget, {
      ...(target.userId ? { userId: target.userId } : {}),
      ...(target.email ? { email: target.email } : {}),
    })
    await startAppPart(ctx, {
      ...(target.userId ? { userId: target.userId } : {}),
      ...(plan.email ? { email: plan.email } : {}),
      deleted: plan.deleted,
      left: plan.left,
    })
    return plan
  }

  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS
  if (!Number.isFinite(graceMs) || graceMs < 0) throw new TypeError(`[nuxt-backend] setupAccount: graceMs is a number of milliseconds from zero up, not ${String(options.graceMs)}.`)
  if ('keepPath' in options) {
    throw new TypeError('[nuxt-backend] setupAccount no longer takes `keepPath`: set `backend.pages.keepAccount` in nuxt.config, and pass the `paths` of paths.generated.ts, which the Nuxt module writes from it.')
  }
  const keepPath = resolveBackendPaths(options.paths, 'setupAccount').keepAccount

  /** The account's address and language, for the emails of its deletion. */
  const recipientOf = async (ctx: Pick<AccountWriteCtx, 'runQuery'>, userId: string) => {
    const user = await ctx.runQuery(refs.adapter.findOne, { model: 'user', where: [{ field: '_id', value: userId }] }) as { email?: string, locale?: string | null } | null
    return user?.email ? { email: user.email, locale: user.locale ?? null } : null
  }

  /** Email the account about its deletion, best effort: a deletion stands without its email. */
  const announce = async <Name extends 'deletionScheduled' | 'deletionCanceled'>(ctx: AccountWriteCtx, userId: string, name: Name, data: (email: string) => EmailTemplateData<Name> | null, idempotencyKey: string): Promise<void> => {
    try {
      const sendTemplate = options.email?.sendTemplate
      const recipient = await recipientOf(ctx, userId)
      const payload = recipient ? data(recipient.email) : null
      if (!sendTemplate || !recipient || !payload) {
        logBackend('warn', 'account.deletion_email_unsent', 'An account\'s deletion notice was not emailed: setupAccount has no email instance, or the deployment has no SITE_URL.')
        return
      }
      await sendTemplate(ctx as never, name, payload, { locale: recipient.locale, idempotencyKey })
    }
    catch (error) {
      logBackend('warn', 'account.deletion_email_unsent', 'An account\'s deletion notice was not emailed; the deletion stands.', error)
    }
  }

  const scheduleDeletion: Account['scheduleDeletion'] = async (ctx, userId) => {
    const token = randomToken()
    const { created, ...deletion } = await ctx.runMutation(refs.account.requestDeletion, { userId, graceMs, tokenHash: await sha256Hex(token) })
    // One timer per deletion: asking again keeps the date, and the one scheduled still fires.
    if (created) await ctx.scheduler.runAt(deletion.deletesAt, eraseByName, { due: userId })
    await record(ctx, 'account.deletion_scheduled', userId)
    const site = readEnv('SITE_URL')?.replace(/\/+$/, '')
    await announce(ctx, userId, 'deletionScheduled', email => site ? { email, deletesAt: deletion.deletesAt, keepUrl: `${site}${keepPath}?token=${encodeURIComponent(token)}` } : null, `nuxt-backend:deletion-scheduled:${userId}:${await sha256Hex(token)}`)
    return deletion
  }

  const cancelDeletion: Account['cancelDeletion'] = async (ctx, userId) => {
    const kept = await ctx.runMutation(refs.account.cancelDeletion, { userId })
    if (!kept) return false
    await afterKept(ctx, userId)
    return true
  }

  /** What follows a cancelled deletion: its trail event and the confirming email. */
  const afterKept = async (ctx: AccountWriteCtx, userId: string): Promise<void> => {
    await record(ctx, 'account.deletion_canceled', userId)
    await announce(ctx, userId, 'deletionCanceled', email => ({ email }), `nuxt-backend:deletion-canceled:${userId}:${Date.now()}`)
  }

  /** Record an event of the account's own on the trail, never failing what it records. */
  const record = async (ctx: AccountWriteCtx, type: 'account.deletion_scheduled' | 'account.deletion_canceled', userId: string): Promise<void> => {
    if (!trail) return
    try {
      await trail.recordBackendEvent(ctx as unknown as AuditCtx, { type, actor: { userId } })
    }
    catch (error) {
      logBackend('warn', 'audit.record_failed', `An ${type} event was not recorded; what it records went through.`, error)
    }
  }

  const forgetEmail: Account['forgetEmail'] = async (ctx, email) => {
    const address = normalizeEmail(email)
    if (!address) throw backendError('invalid_input', { field: 'email' }, '[nuxt-backend] forgetEmail: pass the address to erase.')
    const account = await ctx.runQuery(refs.adapter.findOne, { model: 'user', where: [{ field: 'email', value: address }] })
    if (account) throw backendError('invalid_input', { field: 'email', reason: 'has_account' }, '[nuxt-backend] forgetEmail: an account holds this address; delete the account instead.')
    await forget(ctx, { email: address })
  }

  const exportAccountData = actionGeneric({
    args: {},
    returns: vExport,
    handler: async (ctx): Promise<AccountExport> => {
      const userId = await ownCaller(ctx, 'exportAccountData')
      const { exportId, createdAt, expiresAt } = await ctx.runMutation(refs.account.startExport, { userId })
      const data = await ctx.runQuery(refs.account.exportData, { userId })
      if (!data) throw backendError('unauthenticated', {}, '[nuxt-backend] exportAccountData: this account no longer exists.')
      const billing = options.billing ? await options.billing.exportAccount(ctx, { userId, deleted: data.ownedAlone }) : undefined
      // The files as zip parts beside the document, each file naming its entry.
      const listed = (Array.isArray(data.files) ? data.files : []) as ExportedFile[]
      const bundled = listed.filter(file => file.url !== null).map(file => ({ storageId: file.storageId, name: entryName(file), size: file.size }))
      const parts = bundled.length > 0 ? await ctx.runAction(refs.account.bundleFiles, { exportId, files: bundled }) : []
      const inPart = new Map(parts.flatMap((part, index) => part.files.map(name => [name, { part: index + 1, entry: name }] as const)))
      // Chat threads and knowledge documents, read through the handles their rows carry.
      const ai = await expandAiExport(ctx, data as Record<string, unknown>)
      const app = Object.fromEntries(await Promise.all(sources.filter(([, source]) => source.export).map(async ([key, source]) => [key, await ctx.runQuery(source.export!, { userId })] as const)))
      const document = {
        format: 'nuxt-backend/account-export@1',
        exportedAt: new Date().toISOString(),
        ...data,
        ...ai,
        ...(Array.isArray(data.files) ? { files: listed.map(file => ({ ...file, bundle: inPart.get(entryName(file)) ?? null })) } : {}),
        ...(parts.length > 0 ? { fileBundles: parts.map((part, index) => ({ part: index + 1, url: part.url, bytes: part.bytes, files: part.files })) } : {}),
        ...(billing ? { billingProvider: billing } : {}),
        ...(sources.length > 0 ? { app } : {}),
      }
      const stored = await ctx.runAction(refs.account.storeExport, { exportId, data: JSON.stringify(document, null, 2) })
      if (!stored) throw new Error('[nuxt-backend] exportAccountData: the export was written, but its file has no link.')
      if (trail) {
        try {
          await trail.recordBackendEvent(ctx as unknown as AuditCtx, { type: 'account.data_exported' })
        }
        catch (error) {
          logBackend('warn', 'audit.record_failed', 'An account.data_exported event was not recorded; the export went through.', error)
        }
      }
      return { url: stored.url, createdAt, expiresAt, parts: parts.map(part => ({ url: part.url, bytes: part.bytes, files: part.files.length })) }
    },
  })

  const getAccountExport = queryGeneric({
    args: {},
    returns: v.union(vExportStatus, v.null()),
    handler: async (ctx): Promise<AccountExportStatus | null> => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity || callerRefusal(identity as unknown as Record<string, unknown>, { impersonation: 'refused' }, 'getAccountExport')) return null
      return ctx.runQuery(refs.account.exportStatus, { userId: identity.subject })
    },
  })

  // ── Consents ──────────────────────────────────────────────────────────

  /** A decision lands on the activity trail; the ledger row stands whether or not the event does. */
  const recordConsentEvent = async (ctx: AccountConsentCtx, type: 'consent.granted' | 'consent.withdrawn', userId: string, entry: ConsentEntry): Promise<void> => {
    if (!trail) return
    try {
      await trail.recordBackendEvent(ctx as unknown as AuditCtx, { type, actor: { userId }, subjectId: userId, data: { kind: entry.kind, version: entry.version, source: entry.source } })
    }
    catch (error) {
      logBackend('warn', 'consent.event_unrecorded', 'A consent decision was recorded on the ledger, but its event did not reach the activity trail; the decision stands.', error)
    }
  }

  /** Write decisions of an account and put each one written on the trail. */
  const recordDecisions = async (ctx: AccountConsentCtx, userId: string, entries: ConsentEntry[]): Promise<void> => {
    const written = await ctx.runMutation(refs.consents.record, { userId, entries })
    for (const entry of written) await recordConsentEvent(ctx, entry.granted ? 'consent.granted' : 'consent.withdrawn', userId, entry)
  }

  /** The account of a consent function's caller, or the refusal: nobody signed in, or an administrator acting as the account. */
  const consentCaller = (ctx: { auth: GenericActionCtx<GenericDataModel>['auth'] }, what: string) => ownCaller(ctx, what)

  const declaredKind = (kind: string, what: string): ConsentDeclaration => {
    const declaration = Object.hasOwn(declared, kind) ? declared[kind] : undefined
    if (!declaration) throw backendError('invalid_input', { field: 'kind' }, `[nuxt-backend] ${what}: \`${kind}\` is no kind \`setupAccount({ consents })\` declares.`)
    return declaration
  }

  /** What the account agreed to, against what the app declares now. */
  const viewOf = async (ctx: AccountReadCtx, userId: string): Promise<ConsentsView> => {
    const decisions = new Map((await ctx.runQuery(refs.consents.state, { userId })).map(row => [row.kind, row]))
    const consents = Object.entries(declared).map(([kind, declaration]): ConsentView => {
      const held = decisions.get(kind)
      return {
        kind,
        version: declaration.version,
        ...(declaration.url ? { url: declaration.url } : {}),
        ...(declaration.title ? { title: declaration.title } : {}),
        required: Boolean(declaration.required),
        grantedVersion: held?.granted ? held.version : null,
        grantedAt: held?.granted ? held.at : null,
        current: isCurrent(held, declaration.version),
      }
    })
    const missing = consents.filter(consent => consent.required && !consent.current).map(consent => consent.kind)
    if (minimumAge !== undefined && !ageCurrent(decisions.get(AGE_KIND), minimumAge)) missing.push(AGE_KIND)
    const chosen = decisions.get(STORAGE_KIND)
    return { consents, missing, storage: chosen ? parseStorage(chosen.version) : null, minimumAge: minimumAge ?? null }
  }

  const vConsentView = v.object({
    consents: v.array(v.object({
      kind: v.string(),
      version: v.string(),
      url: v.optional(v.string()),
      title: v.optional(v.string()),
      required: v.boolean(),
      grantedVersion: v.union(v.string(), v.null()),
      grantedAt: v.union(v.number(), v.null()),
      current: v.boolean(),
    })),
    missing: v.array(v.string()),
    storage: v.union(v.array(v.string()), v.null()),
    minimumAge: v.union(v.number(), v.null()),
  })

  const getConsents = queryGeneric({
    args: {},
    returns: v.union(vConsentView, v.null()),
    handler: async (ctx): Promise<ConsentsView | null> => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity || callerRefusal(identity as unknown as Record<string, unknown>, { impersonation: 'refused' }, 'getConsents')) return null
      return viewOf(ctx, identity.subject)
    },
  })

  const getConsentTerms = queryGeneric({
    args: {},
    returns: v.object({
      terms: v.array(v.object({ kind: v.string(), version: v.string(), url: v.optional(v.string()), title: v.optional(v.string()) })),
      minimumAge: v.union(v.number(), v.null()),
    }),
    handler: async (): Promise<ConsentTerms> => ({
      terms: requiredKinds(declared).map(kind => ({ kind, version: declared[kind]!.version, ...(declared[kind]!.url ? { url: declared[kind]!.url } : {}), ...(declared[kind]!.title ? { title: declared[kind]!.title } : {}) })),
      minimumAge: minimumAge ?? null,
    }),
  })

  const grantConsent = mutationGeneric({
    args: { kind: v.string(), age: v.optional(v.number()), source: v.optional(v.union(v.literal('prompt'), v.literal('settings'))) },
    returns: v.null(),
    handler: async (ctx, { kind, age, source }): Promise<null> => {
      const userId = await consentCaller(ctx, 'grantConsent')
      if (kind === AGE_KIND) {
        if (minimumAge === undefined) throw backendError('invalid_input', { field: 'kind' }, '[nuxt-backend] grantConsent: the app sets no minimum age.')
        const typed = readAge(age)
        if (typed === null) throw backendError('invalid_input', { field: 'age' }, '[nuxt-backend] grantConsent: age is a whole number of years.')
        if (typed < minimumAge) throw backendError('forbidden', { reason: 'under_age' }, '[nuxt-backend] grantConsent: under the minimum age.')
        // Only that the minimum was passed is kept, never the number typed.
        await recordDecisions(ctx, userId, [{ kind: AGE_KIND, version: ageVersion(minimumAge), granted: true, source: source ?? 'prompt' }])
        return null
      }
      const declaration = declaredKind(kind, 'grantConsent')
      await recordDecisions(ctx, userId, [{ kind, version: declaration.version, granted: true, source: source ?? 'settings' }])
      return null
    },
  })

  const withdrawConsent = mutationGeneric({
    args: { kind: v.string() },
    returns: v.null(),
    handler: async (ctx, { kind }): Promise<null> => {
      const userId = await consentCaller(ctx, 'withdrawConsent')
      const declaration = declaredKind(kind, 'withdrawConsent')
      if (declaration.required) throw backendError('invalid_input', { field: 'kind', reason: 'required' }, `[nuxt-backend] withdrawConsent: \`${kind}\` is required; a person who no longer agrees deletes their account.`)
      const held = await ctx.runQuery(refs.consents.latest, { userId, kind })
      // Nothing to withdraw: a kind never granted, or already withdrawn.
      if (!held?.granted) return null
      await recordDecisions(ctx, userId, [{ kind, version: held.version, granted: false, source: 'settings' }])
      return null
    },
  })

  const chooseStorage = mutationGeneric({
    args: { purposes: v.array(v.string()), source: v.optional(v.union(v.literal('prompt'), v.literal('settings'))) },
    returns: v.null(),
    handler: async (ctx, { purposes, source }): Promise<null> => {
      const userId = await consentCaller(ctx, 'chooseStorage')
      const unknown = purposes.find(purpose => !(STORAGE_PURPOSES as readonly string[]).includes(purpose))
      if (unknown !== undefined) throw backendError('invalid_input', { field: 'purposes' }, `[nuxt-backend] chooseStorage: \`${unknown}\` is no purpose (${STORAGE_PURPOSES.join(', ')}).`)
      const allowed = purposes as StoragePurpose[]
      await recordDecisions(ctx, userId, [{ kind: STORAGE_KIND, version: encodeStorage(allowed), granted: allowed.length > 0, source: source ?? 'prompt' }])
      return null
    },
  })

  const consented: Account['consented'] = async (ctx, { userId, kind }) => {
    if (kind === AGE_KIND && minimumAge !== undefined) return ageCurrent(await ctx.runQuery(refs.consents.latest, { userId, kind }), minimumAge)
    const declaration = declaredKind(kind, 'account.consented')
    return isCurrent(await ctx.runQuery(refs.consents.latest, { userId, kind }), declaration.version)
  }

  const requireConsent: Account['requireConsent'] = async (ctx, { userId, kinds }) => {
    const names = kinds ?? requiredKinds(declared)
    for (const kind of names) {
      if (!await consented(ctx, { userId, kind })) {
        throw backendError('forbidden', { reason: 'consent_required', kind }, `[nuxt-backend] requireConsent: the account has not accepted the latest \`${kind}\`.`)
      }
    }
  }

  const gate: AccountGate = {
    minimumAge,
    signUp: async (ctx, { userId, email, agreed = true }) => {
      // An account an administrator created agreed to nothing yet: only what its address gave before is carried over.
      const entries: ConsentEntry[] = agreed ? requiredKinds(declared).map(kind => ({ kind, version: declared[kind]!.version, granted: true, source: 'sign-up' })) : []
      if (agreed && minimumAge !== undefined) entries.push({ kind: AGE_KIND, version: ageVersion(minimumAge), granted: true, source: 'sign-up' })
      const { recorded } = await ctx.runMutation(refs.consents.recordSignUp, { userId, email, entries })
      for (const entry of recorded) await recordConsentEvent(ctx, 'consent.granted', userId, entry)
    },
  }

  const getAccountDeletion = queryGeneric({
    args: {},
    returns: v.union(vDeletion, v.null()),
    handler: async (ctx): Promise<AccountDeletion | null> => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity || callerRefusal(identity as unknown as Record<string, unknown>, { impersonation: 'refused' }, 'getAccountDeletion')) return null
      return ctx.runQuery(refs.account.deletion, { userId: identity.subject })
    },
  })

  const cancelAccountDeletion = mutationGeneric({
    args: { token: v.optional(v.string()) },
    returns: v.boolean(),
    handler: async (ctx, { token }): Promise<boolean> => {
      // The link's token needs no sign-in; without one the signed-in caller cancels their own.
      if (token !== undefined) {
        const kept = await ctx.runMutation(refs.account.cancelDeletion, { tokenHash: await sha256Hex(token) })
        if (!kept) return false
        await afterKept(ctx as unknown as AccountWriteCtx, kept.userId)
        return true
      }
      const userId = await ownCaller(ctx, 'cancelAccountDeletion')
      return cancelDeletion(ctx as unknown as AccountWriteCtx, userId)
    },
  })

  const vOnboarding = v.object({ onboardedAt: v.union(v.number(), v.null()) })

  const getOnboarding = queryGeneric({
    args: {},
    returns: v.union(vOnboarding, v.null()),
    handler: async (ctx): Promise<OnboardingState | null> => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      const { onboardedAt } = await ctx.runQuery(refs.onboarding.marks, { userId: identity.subject })
      return { onboardedAt }
    },
  })

  const completeOnboarding = mutationGeneric({
    args: {},
    returns: vOnboarding,
    handler: async (ctx): Promise<OnboardingState> => {
      const userId = await ownCaller(ctx, 'completeOnboarding')
      return { onboardedAt: await ctx.runMutation(refs.onboarding.complete, { userId }) }
    },
  })

  return {
    api: { exportAccountData, getAccountExport, getAccountDeletion, cancelAccountDeletion, eraseAccountData, getConsents, getConsentTerms, grantConsent, withdrawConsent, chooseStorage, getOnboarding, completeOnboarding } as Account['api'],
    scheduleDeletion,
    cancelDeletion,
    forget,
    forgetEmail,
    soleOwnerships: (ctx, userId) => ctx.runQuery(refs.account.soleOwnerships, { userId }),
    consented,
    requireConsent,
    gate,
    keepPath,
  }
}
