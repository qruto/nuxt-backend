import type { ComputedRef } from 'vue'
import { type AuthConfig, type DataModelFromSchemaDefinition, defineSchema, defineTable, type FunctionReference, type FunctionReturnType, type HttpRouter, internalMutationGeneric, type MutationBuilder, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import { customCtx, customMutation } from 'convex-helpers/server/customFunctions'
import { type GenericId, v } from 'convex/values'
import type { WorkflowManager } from '@convex-dev/workflow'
import { describe, expectTypeOf, test } from 'vitest'
import type pkg from '../../package.json'
import backendModule, { type ModuleOptions } from 'nuxt-backend'
import { setupAuth, type SetupAuthOptions } from 'nuxt-backend/auth'
import { registerBackendRoutes } from 'nuxt-backend/http'
import { createFunctions, defineRetention, normalizeEmail, randomToken, RECENT_SIGN_IN_SECONDS, type RetentionResult, SENSITIVE_ACTIONS, sha256Hex } from 'nuxt-backend/functions'
import { type BackendEnvironment, backendEnv, backendEnvironment } from 'nuxt-backend/app'
import { ALL_BILLING_EVENTS, type BillingAccessRule, type BillingEntity, type BillingEntityCtx, defineBillingCatalog, type SetupBillingConfig, setupBilling } from 'nuxt-backend/billing'
import type { ALL_EMAIL_EVENTS, EmailWebhookEventType } from 'nuxt-backend/email'
import { setupEmail } from 'nuxt-backend/email'
import { DEFAULT_LIMITS, MINUTE, setupRateLimiter } from 'nuxt-backend/rate-limit'
import { defineSearch, search } from 'nuxt-backend/search'
import { defineEmailSequence, setupWorkflows } from 'nuxt-backend/workflows'
import { type Audit, type AuditPage, BACKEND_EVENTS, setupAudit, vBackendEvent } from 'nuxt-backend/audit'
import { type Access, ACCESS_PHASES, type AccessPhase, setupAccess, setupWaitlist, type Waitlist } from 'nuxt-backend/access'
import { type Account, ACCOUNT_DATA_SOURCES, type AccountDeletion, type AccountErasurePlan, type AccountExport, type AccountExportStatus, setupAccount } from 'nuxt-backend/account'
import { type Admin, type AdminUserDetail, type AdminUserPage, type AdminWorkspaceDetail, type AdminWorkspacePage, setupAdmin } from 'nuxt-backend/admin'
import { type AdminFlag, BACKEND_FLAGS, defineFlags, type FlagValues, type Flags, setupFlags } from 'nuxt-backend/flags'
import { setupStorage, type Storage, type StoredFile } from 'nuxt-backend/storage'
import { type Notifications, type NotificationsPage, type NotifyOptions, setupNotifications, type UnreadCount } from 'nuxt-backend/notifications'
import { type ImageStoreContext, priceTokens, setupAi, type MeteredContext, type ModelStatus, type ReportedCost, type StepResult } from 'nuxt-backend/ai'
import { checkIn, MONITORING_TAGS, reportError, reportingErrors } from 'nuxt-backend/monitoring'
import backendComponent from 'nuxt-backend/convex.config'
import authConfig, { defineBackendAuthConfig } from 'nuxt-backend/auth.config'
import backendTest, { asUser, defineBackendTestApp, register, seedWorkspace } from 'nuxt-backend/test'
import { BACKEND_ESLINT_RULES, backendEslint } from 'nuxt-backend/eslint'
import { backendMockProvides, backendTestAliases, type BackendMock, type BackendMockUser, createBackendMock, resetBackendMock } from 'nuxt-backend/test-utils'
import type { Linter } from 'eslint'
import { useCredits } from '../../src/runtime/vue/composables/use-credits'
// The ComponentApi has no typed subpath of its own (Convex codegen output, see
// `Untyped`), so it is read from the committed source.
import type { ComponentApi } from '../../src/convex/components/backend/_generated/component'

// The typed subpaths are the product. Every runtime test imports a source file
// by path; nothing else imports `nuxt-backend/<subpath>` the way a consumer
// does and asserts what comes back. These assertions are the compile: vitest
// hands this file to tsc (the `types` project) and maps each type error to the
// `test` it sits in, so a failure names the subpath. A few load-bearing shapes
// per entry, not the whole surface — the export names are frozen in
// test/nuxt/public-surface.test.ts; this file pins the types behind the names
// a scaffolded app calls first.

/** `exports` keys that carry no TypeScript: self-reference, the Convex codegen output and its `.js` twins. */
type Untyped
  = | './package.json'
    | './_generated/component'
    | './_generated/component.js'
    | './convex.config.js'

type Tested
  = | '.'
    | './auth'
    | './http'
    | './functions'
    | './app'
    | './billing'
    | './email'
    | './rate-limit'
    | './search'
    | './workflows'
    | './audit'
    | './access'
    | './account'
    | './admin'
    | './flags'
    | './ai'
    | './storage'
    | './notifications'
    | './monitoring'
    | './convex.config'
    | './auth.config'
    | './test'
    | './test-utils'
    | './eslint'

type Subpath = Exclude<keyof typeof pkg.exports, Untyped>

test('every typed subpath in package.json exports is covered here', () => {
  // `exports` is read as a literal type, so a subpath added to package.json
  // without a line here — or a line here that no longer resolves — fails the
  // compile, not a reviewer's memory.
  expectTypeOf<Exclude<Subpath, Tested>>().toEqualTypeOf<never>()
  expectTypeOf<Exclude<Tested, Subpath>>().toEqualTypeOf<never>()
})

test('nuxt-backend', () => {
  expectTypeOf(backendModule).toBeFunction()
  // Pages take paths only: every page mounts, a string moves it.
  expectTypeOf<{ pricing: '/plans' }>().toExtend<NonNullable<ModuleOptions['pages']>>()
  expectTypeOf<false>().not.toExtend<ModuleOptions['pages']>()
  // The end-user MCP endpoint waits for the next release: no `mcp` option.
  expectTypeOf<ModuleOptions>().not.toHaveProperty('mcp')
})

// The Convex integrations — what a scaffolded `backend/*.ts` calls.
describe('integrations', () => {
  test('nuxt-backend/auth', () => {
    // The setup returns the pieces the scaffold re-exports.
    expectTypeOf(setupAuth).returns.toHaveProperty('getAuthUser')
    expectTypeOf(setupAuth).returns.toHaveProperty('createAuth')
    expectTypeOf(setupAuth).returns.toHaveProperty('authComponent')
    // The templates live with the email instance, which every auth email goes through.
    expectTypeOf(setupAuth).returns.not.toHaveProperty('emailTemplates')
    expectTypeOf(setupAuth).returns.not.toHaveProperty('createAuthOptions')
    // The cross-component wiring sits at the top level of the options.
    expectTypeOf<SetupAuthOptions>().toHaveProperty('rateLimiter')
    expectTypeOf<SetupAuthOptions['email']>().not.toBeNullable()
    expectTypeOf<SetupAuthOptions>().not.toHaveProperty('integrations')
  })

  test('nuxt-backend/http', () => {
    // Mounts onto the app's router and returns nothing.
    expectTypeOf(registerBackendRoutes).parameter(0).toEqualTypeOf<HttpRouter>()
    expectTypeOf(registerBackendRoutes).returns.toBeVoid()
    // Every part is required: a route left out would answer 404 at its first call.
    expectTypeOf<Parameters<typeof registerBackendRoutes>[1]['billing']>().not.toBeNullable()
    expectTypeOf<Parameters<typeof registerBackendRoutes>[1]['email']>().not.toBeNullable()
    expectTypeOf<Parameters<typeof registerBackendRoutes>[1]['ai']>().not.toBeNullable()
    expectTypeOf<Parameters<typeof registerBackendRoutes>[1]['auth']>().not.toHaveProperty('mcp')
  })

  test('nuxt-backend/functions', () => {
    // Every tier a scaffolded `functions.ts` exports, from one call, and the
    // internal mutation that makes the first administrator.
    for (const tier of ['authed', 'workspace', 'admin', 'withRole', 'withFeature', 'setUserRole'] as const) expectTypeOf(createFunctions).returns.toHaveProperty(tier)
    expectTypeOf(createFunctions).parameter(1).toHaveProperty('components')
    expectTypeOf(RECENT_SIGN_IN_SECONDS).toBeNumber()
    expectTypeOf(SENSITIVE_ACTIONS).toBeObject()
  })

  test('nuxt-backend/app', () => {
    // The env declaration `defineApp` receives — required vs optional is typed.
    expectTypeOf(backendEnv.AUTH_SECRET.isOptional).toEqualTypeOf<'required'>()
    expectTypeOf(backendEnv.EMAIL_API_KEY.isOptional).toEqualTypeOf<'optional'>()
    // The kind of deployment, for an app's own code.
    expectTypeOf(backendEnvironment()).toEqualTypeOf<BackendEnvironment | undefined>()
    expectTypeOf<BackendEnvironment>().toEqualTypeOf<'development' | 'preview' | 'sandbox' | 'production'>()
  })

  test('nuxt-backend/billing', () => {
    expectTypeOf(setupBilling).parameter(1).toEqualTypeOf<SetupBillingConfig>()
    expectTypeOf<SetupBillingConfig['email']>().not.toBeNullable()
    expectTypeOf(setupBilling).returns.toHaveProperty('api')
    // The provider's own client never leaves setupBilling.
    expectTypeOf<Extract<keyof ReturnType<typeof setupBilling>, 'provider'>>().toBeNever()
    // One entity resolver, and none of the provider client's own option names.
    // A checking call hands the resolver its rule; resolving alone passes none.
    expectTypeOf<SetupBillingConfig['resolveEntity']>().toEqualTypeOf<((ctx: BillingEntityCtx, rule?: BillingAccessRule) => Promise<BillingEntity | null>) | undefined>()
    expectTypeOf<Extract<keyof SetupBillingConfig, 'getUserInfo' | 'currentUserId' | 'organizationToken' | 'server'>>().toBeNever()
    expectTypeOf(defineBillingCatalog).toBeFunction()
    expectTypeOf(ALL_BILLING_EVENTS).toExtend<readonly string[]>()
  })

  test('nuxt-backend/email', () => {
    expectTypeOf(setupEmail).returns.toHaveProperty('send')
    // The templates of every email the package sends, rendered or sent by name.
    expectTypeOf(setupEmail).returns.toHaveProperty('render')
    expectTypeOf(setupEmail).returns.toHaveProperty('sendTemplate')
    expectTypeOf(setupEmail).returns.toHaveProperty('api')
    expectTypeOf<EmailWebhookEventType>().toExtend<(typeof ALL_EMAIL_EVENTS)[number]>()
  })

  test('nuxt-backend/rate-limit', () => {
    // The defaults keep their literal kinds, so `limit(ctx, 'emailOtp')` knows
    // it is a bucket; custom limits widen the set, not the defaults.
    expectTypeOf(DEFAULT_LIMITS.emailOtp.kind).toEqualTypeOf<'token bucket'>()
    expectTypeOf(DEFAULT_LIMITS.emailOtpGlobal.kind).toEqualTypeOf<'fixed window'>()
    expectTypeOf(setupRateLimiter).returns.toHaveProperty('limit')
    expectTypeOf(MINUTE).toBeNumber()
  })

  test('nuxt-backend/search', () => {
    expectTypeOf(defineSearch).toBeFunction()
    expectTypeOf(search).toBeFunction()
  })

  test('nuxt-backend/workflows', () => {
    expectTypeOf(setupWorkflows).returns.toEqualTypeOf<WorkflowManager>()
    expectTypeOf(defineEmailSequence).toBeFunction()
  })

  test('nuxt-backend/audit', () => {
    const components = null as unknown as Parameters<typeof setupAudit>[0]
    const audit = setupAudit(components)
    expectTypeOf(audit).toEqualTypeOf<Audit>()
    const ctx = null as unknown as Parameters<Audit['recordBackendEvent']>[0]
    // A package kind takes its own fields, typed.
    void audit.recordBackendEvent(ctx, { type: 'workspace.member_invited', entityId: 'w1', data: { role: 'member' } })
    // @ts-expect-error -- a role is a string
    void audit.recordBackendEvent(ctx, { type: 'workspace.member_invited', entityId: 'w1', data: { role: 1 } })
    // @ts-expect-error -- not a field of the kind
    void audit.recordBackendEvent(ctx, { type: 'auth.signed_in', data: { email: 'a@b.c' } })
    // An app's own kind lives under `app.`, with flat values.
    void audit.recordBackendEvent(ctx, { type: 'app.project_archived', targetId: 'p1', data: { name: 'Apollo', count: 2 } })
    // @ts-expect-error -- not a kind, and not under `app.`
    void audit.recordBackendEvent(ctx, { type: 'project.archived' })
    // Each read answers a page, or `null` to a caller it is not for.
    type Answers<Q> = Q extends RegisteredQuery<'public', infer _Args, infer Result> ? Awaited<Result> : never
    expectTypeOf<Answers<typeof audit.api.listActivity>>().toEqualTypeOf<AuditPage | null>()
    expectTypeOf<Answers<typeof audit.api.listAllActivity>>().toEqualTypeOf<AuditPage | null>()
    expectTypeOf(BACKEND_EVENTS['auth.signed_in'].scope).toEqualTypeOf<'account'>()
    expectTypeOf(BACKEND_EVENTS['workspace.member_invited'].scope).toEqualTypeOf<'workspace'>()
    expectTypeOf(vBackendEvent.type.id).toEqualTypeOf<string>()
  })

  test('nuxt-backend/access', () => {
    const components = null as unknown as Parameters<typeof setupAccess>[0]
    const audit = null as unknown as Parameters<typeof setupAccess>[1]['audit']
    const access = setupAccess(components, { phases: ['invite-only', 'public'], domains: ['panels.example'], audit })
    expectTypeOf(access).toEqualTypeOf<Access>()
    expectTypeOf(access.phases).toEqualTypeOf<readonly AccessPhase[]>()
    expectTypeOf(ACCESS_PHASES).toEqualTypeOf<readonly ['early-access', 'invite-only', 'public']>()
    // @ts-expect-error -- a phase is one of the three
    setupAccess(components, { phases: ['beta'], audit })
    // setupAuth takes the instance as `access`.
    expectTypeOf(access).toMatchTypeOf<NonNullable<Parameters<typeof setupAuth>[2]['access']>>()
  })

  test('nuxt-backend/access, the waitlist', () => {
    const components = null as unknown as Parameters<typeof setupWaitlist>[0]
    const options = null as unknown as Parameters<typeof setupWaitlist>[1]
    const waitlist = setupWaitlist(components, { ...options, questions: { role: ['Writer', 'Illustrator'] } })
    expectTypeOf(waitlist).toEqualTypeOf<Waitlist>()
    expectTypeOf(waitlist.questions).toEqualTypeOf<Readonly<Record<string, readonly string[]>>>()
    expectTypeOf(waitlist.api).toHaveProperty('joinWaitlist')
    expectTypeOf(waitlist.api).toHaveProperty('admitWaitlist')
    // @ts-expect-error -- the access instance and the email instance are required
    setupWaitlist(components, { questions: {} })
  })

  test('nuxt-backend/account', () => {
    const components = null as unknown as Parameters<typeof setupAccount>[0]
    const account = setupAccount(components)
    expectTypeOf(account).toEqualTypeOf<Account>()
    // An app's own source names its export query and its erasure mutation.
    const exportFor = null as unknown as FunctionReference<'query', 'internal', { userId: string }, unknown>
    const forgetFor = null as unknown as FunctionReference<'mutation', 'internal', { userId?: string, email?: string }, { done: boolean } | null>
    setupAccount(components, { sources: { todos: { description: 'To-dos', export: exportFor, forget: forgetFor } } })
    // @ts-expect-error -- a source says what it holds
    setupAccount(components, { sources: { todos: { export: exportFor } } })
    // The export answers its link; the status, `null` to a caller it is not for.
    type Answers<Q> = Q extends RegisteredQuery<'public', infer _Args, infer Result> ? Awaited<Result> : never
    expectTypeOf<Answers<typeof account.api.getAccountExport>>().toEqualTypeOf<AccountExportStatus | null>()
    expectTypeOf(account.forget).returns.resolves.toEqualTypeOf<AccountErasurePlan>()
    expectTypeOf(ACCOUNT_DATA_SOURCES.audit.erasure).toEqualTypeOf<'pseudonymized'>()
    expectTypeOf<AccountExport['url']>().toEqualTypeOf<string>()
    expectTypeOf<AccountExport['parts'][number]['files']>().toEqualTypeOf<number>()
    // A deletion waits out its grace period: the caller's own date, or nothing; the link's token cancels it.
    expectTypeOf<Answers<typeof account.api.getAccountDeletion>>().toEqualTypeOf<AccountDeletion | null>()
    type Takes<M> = M extends RegisteredMutation<'public', infer Args, infer _Result> ? Args : never
    expectTypeOf<Takes<typeof account.api.cancelAccountDeletion>>().toEqualTypeOf<{ token?: string }>()
    expectTypeOf(account.scheduleDeletion).returns.resolves.toEqualTypeOf<AccountDeletion>()
    setupAccount(components, { graceMs: 7 * 24 * 60 * 60 * 1000, paths: { keepAccount: '/keep' } })
    // @ts-expect-error -- the keep page's path comes from nuxt.config, through the generated paths
    setupAccount(components, { keepPath: '/keep' })
    // @ts-expect-error -- the grace period is a number of milliseconds
    setupAccount(components, { graceMs: '7 days' })
  })

  test('nuxt-backend/notifications', () => {
    const components = null as unknown as Parameters<typeof setupNotifications>[0]
    const notifications = setupNotifications(components, { notify: { 'app.strip_ready': { channels: ['app'], link: event => `/strips/${event.targetId}` } } })
    expectTypeOf(notifications).toEqualTypeOf<Notifications>()
    // The reads answer a page and a count; the write names what it marks.
    type Answers<Q> = Q extends RegisteredQuery<'public', infer _Args, infer Result> ? Awaited<Result> : never
    expectTypeOf<Answers<typeof notifications.api.listNotifications>>().toEqualTypeOf<NotificationsPage>()
    expectTypeOf<Answers<typeof notifications.api.getUnreadCount>>().toEqualTypeOf<UnreadCount>()
    expectTypeOf<NotifyOptions>().toMatchTypeOf<Record<`app.${string}`, unknown>>()
    // @ts-expect-error -- a notify key is one of the app's own, under app.
    setupNotifications(components, { notify: { strip_ready: { channels: ['app'] } } })
    // @ts-expect-error -- the channels are app, email and push
    setupNotifications(components, { notify: { 'app.strip_ready': { channels: ['sms'] } } })
  })

  test('nuxt-backend/admin', () => {
    const components = null as unknown as Parameters<typeof setupAdmin>[0]
    const admin = setupAdmin(components, { adminRoles: ['admin', 'support'] })
    expectTypeOf(admin).toEqualTypeOf<Admin>()
    // @ts-expect-error -- the roles are a list
    setupAdmin(components, { adminRoles: 'admin' })
    // Each read answers its rows, or `null` to anyone who is no administrator.
    type Answers<Q> = Q extends RegisteredQuery<'public', infer _Args, infer Result> ? Awaited<Result> : never
    expectTypeOf<Answers<typeof admin.api.listUsers>>().toEqualTypeOf<AdminUserPage | null>()
    expectTypeOf<Answers<typeof admin.api.getUser>>().toEqualTypeOf<AdminUserDetail | null>()
    expectTypeOf<Answers<typeof admin.api.listWorkspaces>>().toEqualTypeOf<AdminWorkspacePage | null>()
    expectTypeOf<Answers<typeof admin.api.getWorkspace>>().toEqualTypeOf<AdminWorkspaceDetail | null>()
    expectTypeOf<AdminUserDetail['sessions'][number]>().not.toHaveProperty('token')
    // With the app's DataModel, checking the reported row's table narrows its id to that table's.
    const _schema = defineSchema({ strips: defineTable({ idea: v.string(), authorId: v.string(), hidden: v.optional(v.boolean()) }) })
    type DM = DataModelFromSchemaDefinition<typeof _schema>
    const email = null as unknown as ReturnType<typeof setupEmail>
    setupAdmin<DM>(components, {
      email,
      reports: {
        describe: async (ctx, { table, id }) => {
          if (table !== 'strips') return null
          const strip = await ctx.db.get('strips', id)
          expectTypeOf(strip?.idea).toEqualTypeOf<string | undefined>()
          return strip && { title: strip.idea, authorId: strip.authorId }
        },
        hide: async (ctx, subject) => subject.table === 'strips' ? ctx.db.patch('strips', subject.id, { hidden: true }) : undefined,
      },
    })
  })

  test('nuxt-backend/functions retention and token helpers', () => {
    const _schema = defineSchema({
      strips: defineTable({ status: v.string(), photoId: v.string(), updatedAt: v.number() }).index('by_status_and_updatedAt', ['status', 'updatedAt']),
      todos: defineTable({ done: v.boolean() }),
    })
    type DM = DataModelFromSchemaDefinition<typeof _schema>
    const internalMutation = internalMutationGeneric as MutationBuilder<DM, 'internal'>
    const rule = defineRetention(internalMutation, {
      fn: 'retention:pruneDrafts',
      table: 'strips',
      index: 'by_status_and_updatedAt',
      match: { status: 'draft' },
      ttl: 1000,
      // The row is typed from the schema, the context from the builder.
      onDelete: async (ctx, strip) => {
        expectTypeOf(strip.photoId).toBeString()
        await ctx.db.insert('todos', { done: false })
      },
    })
    expectTypeOf(rule).toEqualTypeOf<RegisteredMutation<'internal', { now?: number }, Promise<RetentionResult>>>()
    expectTypeOf<RetentionResult>().toEqualTypeOf<{ deleted: number, more: boolean }>()
    // A builder wrapped with custom context (the trigger-wrapped one an aggregate needs) is a builder all the same.
    const wrapped = customMutation(internalMutation, customCtx(() => ({})))
    defineRetention(wrapped, { fn: 'retention:a', table: 'todos', index: 'by_creation_time', ttl: 0 })
    // @ts-expect-error -- not a table of this app
    defineRetention(internalMutation, { fn: 'retention:b', table: 'comments', index: 'by_creation_time', ttl: 0 })
    // @ts-expect-error -- not an index of this table
    defineRetention(internalMutation, { fn: 'retention:c', table: 'todos', index: 'by_status_and_updatedAt', ttl: 0 })
    // @ts-expect-error -- not a field of the index
    defineRetention(internalMutation, { fn: 'retention:d', table: 'strips', index: 'by_status_and_updatedAt', match: { photoId: 'x' }, ttl: 0 })
    // @ts-expect-error -- the age is required
    defineRetention(internalMutation, { fn: 'retention:e', table: 'todos', index: 'by_creation_time' })
    expectTypeOf(randomToken()).toBeString()
    expectTypeOf(sha256Hex('x')).toEqualTypeOf<Promise<string>>()
    expectTypeOf(normalizeEmail('A@b.c')).toBeString()
  })

  test('nuxt-backend/storage', () => {
    const _schema = defineSchema({ strips: defineTable({ authorId: v.string(), coverId: v.optional(v.string()) }) })
    type DM = DataModelFromSchemaDefinition<typeof _schema>
    const components = null as unknown as Parameters<typeof setupStorage>[0]
    const storage = setupStorage<DM>(components, { maxSize: 1024, accept: ['image/png'], quota: { files: 10, bytes: 'storageBytes' } })
    expectTypeOf(storage).toEqualTypeOf<Storage<DM>>()
    const ctx = null as unknown as Parameters<typeof storage.store>[0]
    expectTypeOf(storage.store(ctx, new ArrayBuffer(1), { userId: 'u' })).toEqualTypeOf<Promise<StoredFile>>()
    storage.shareable('strips', { path: '/s', canShare: (caller, strip) => strip.authorId === caller.user.id, ogImage: strip => strip.coverId })
    // @ts-expect-error -- not a table of this app
    storage.shareable('todos', { path: '/t', canShare: () => true })
    // @ts-expect-error -- the owner names the account
    void storage.claim(ctx, 'kg2', { workspaceId: 'w' })
    // getFileUrl takes a storage id, as `<StorageImage :get-url>` does.
    type FileUrlArgs = typeof storage.api.getFileUrl extends RegisteredQuery<'public', infer Args, infer _R> ? Args : never
    expectTypeOf<FileUrlArgs['storageId']>().toEqualTypeOf<GenericId<'_storage'>>()
  })

  test('nuxt-backend/flags', () => {
    const components = null as unknown as Parameters<typeof setupFlags>[0]
    const audit = null as unknown as Parameters<typeof setupFlags>[1]['audit']
    const definitions = defineFlags({ newEditor: { default: false, description: 'The rewritten editor.' } })
    const flags = setupFlags(components, { flags: definitions, audit })
    expectTypeOf(flags).toEqualTypeOf<Flags<typeof definitions>>()
    const ctx = null as unknown as Parameters<typeof flags.isEnabled>[0]
    // A flag the app declares, or one of the package's own.
    expectTypeOf(flags.isEnabled(ctx, 'newEditor')).toEqualTypeOf<Promise<boolean>>()
    expectTypeOf(flags.isEnabled(ctx, 'pause_checkout')).toEqualTypeOf<Promise<boolean>>()
    // @ts-expect-error -- not a flag of this app
    void flags.isEnabled(ctx, 'oldEditor')
    // @ts-expect-error -- a kill switch is honored by the package, never required by a function
    void flags.requireFlag(ctx, 'maintenance')
    // @ts-expect-error -- a default is true or false
    defineFlags({ newEditor: { default: 'yes', description: 'x' } })
    expectTypeOf(BACKEND_FLAGS.pause_ai.pauses).toEqualTypeOf<'ai'>()
    type Answers<Q> = Q extends RegisteredQuery<'public', infer _Args, infer Result> ? Awaited<Result> : never
    expectTypeOf<Answers<typeof flags.api.getFlags>>().toEqualTypeOf<FlagValues>()
    expectTypeOf<Answers<typeof flags.api.listFlags>>().toEqualTypeOf<AdminFlag[] | null>()
  })

  test('nuxt-backend/ai', () => {
    expectTypeOf(setupAi).returns.toHaveProperty('meteredAction')
    expectTypeOf(setupAi).returns.toHaveProperty('modelStatus').returns.toEqualTypeOf<ModelStatus>()
    expectTypeOf(priceTokens).returns.toBeNumber()
    // ctx.model() hands an AI SDK model to generateText and the rest of the SDK.
    expectTypeOf<ReturnType<MeteredContext['model']>>().toHaveProperty('doGenerate')
    expectTypeOf<ReportedCost<Record<string, never>>>().toHaveProperty('creditsPerUsd').toBeNumber()
    // job.run hands back what the step returned, not the queue's own outcome.
    expectTypeOf<StepResult<{ value: string[] } | Record<string, unknown>>>().toEqualTypeOf<string[]>()
    // A generated image's id goes into a v.id('_storage') field as it is.
    expectTypeOf<Awaited<ReturnType<ImageStoreContext['storeImage']>>>().toEqualTypeOf<GenericId<'_storage'>>()
  })

  test('nuxt-backend/monitoring', () => {
    // A report never rejects: it resolves whether it was sent.
    expectTypeOf(reportError).returns.resolves.toBeBoolean()
    expectTypeOf(checkIn).parameter(1).toExtend<{ schedule?: { cron: string } | { every: { hours?: number } } } | undefined>()
    // A wrapped handler keeps the handler's own signature.
    const handler = reportingErrors(async (_ctx: { runQuery: unknown }, args: { url: string }) => args.url.length)
    expectTypeOf(handler).toEqualTypeOf<(ctx: { runQuery: unknown }, args: { url: string }) => Promise<number>>()
    expectTypeOf(MONITORING_TAGS.function).toEqualTypeOf<'backend.function'>()
  })

  // The two files a scaffold re-exports verbatim.
  test('nuxt-backend/auth.config', () => {
    expectTypeOf(authConfig).toEqualTypeOf<AuthConfig>()
    expectTypeOf(defineBackendAuthConfig).returns.toEqualTypeOf<AuthConfig>()
  })

  test('nuxt-backend/test', () => {
    expectTypeOf(register).returns.toBeVoid()
    expectTypeOf(backendTest).toHaveProperty('register')
    expectTypeOf(backendTest).toHaveProperty('schema')
    expectTypeOf(backendTest).toHaveProperty('modules')
    // A test app per call, and callers that carry a session's claims.
    expectTypeOf(defineBackendTestApp).returns.toBeFunction()
    expectTypeOf(asUser).returns.resolves.toHaveProperty('userId')
    expectTypeOf(asUser).returns.resolves.toHaveProperty('query')
    expectTypeOf(seedWorkspace).returns.resolves.toBeString()
  })
})

test('nuxt-backend/eslint', () => {
  // What `withNuxt(…)` and a plain flat config both take.
  expectTypeOf(backendEslint).returns.toEqualTypeOf<Linter.Config[]>()
  expectTypeOf(backendEslint).parameter(0).toExtend<{ functionsDir?: string, rules?: Linter.RulesRecord } | undefined>()
  expectTypeOf(BACKEND_ESLINT_RULES).toExtend<Linter.RulesRecord>()
})

test('nuxt-backend/test-utils', () => {
  // What a Vite config's `resolve.alias` takes, and a mock whose state a test changes.
  expectTypeOf(backendTestAliases).returns.toEqualTypeOf<Record<string, string>>()
  const backend = createBackendMock({ user: { name: 'Ada' }, queries: { 'billing:getCredits': null } })
  expectTypeOf(backend.state.user).toEqualTypeOf<BackendMockUser | null>()
  expectTypeOf(backend.signIn).returns.toEqualTypeOf<BackendMockUser>()
  expectTypeOf(backend.stub).returns.toEqualTypeOf<BackendMock>()
  expectTypeOf(resetBackendMock).returns.toBeVoid()
  // What `mount(…, { global: { provide } })` takes.
  expectTypeOf(backendMockProvides).returns.toExtend<Record<symbol, unknown>>()
  // A function by its name or its reference.
  expectTypeOf<string | FunctionReference<'action'>>().toExtend<Parameters<typeof backend.callsTo>[0]>()
})

// The component's definition and the API an app reaches it through, exactly as
// `app.use()` and `components.backend` see them.
describe('component', () => {
  test('nuxt-backend/convex.config', () => {
    expectTypeOf(backendComponent).toHaveProperty('use')
  })

  // What a consumer's `components.backend.*` is typed against. A public
  // component function without a return validator surfaces there as `any` —
  // these three once did.
  test('the ComponentApi types every query result', () => {
    type Api = ComponentApi
    expectTypeOf<FunctionReturnType<Api['email']['status']>>().not.toBeAny()
    expectTypeOf<FunctionReturnType<Api['email']['status']>>().toEqualTypeOf<NonNullable<FunctionReturnType<Api['email']['status']>> | null>()
    expectTypeOf<NonNullable<FunctionReturnType<Api['email']['get']>>>().toHaveProperty('finalizedAt').toEqualTypeOf<number>()
    expectTypeOf<NonNullable<FunctionReturnType<Api['email']['get']>>>().not.toHaveProperty('resendId')
    expectTypeOf<FunctionReturnType<Api['webhooks']['listRecent']>[number]['outcome']>().toEqualTypeOf<'ok' | 'invalid_signature' | 'unknown_type' | 'handler_error' | 'duplicate' | 'oversized' | 'missing_secret'>()
  })
})

// The auto-imported composables have no subpath; `useCredits` stands in for
// them because its result is the shape a template binds to first.
test('useCredits (auto-imported)', () => {
  expectTypeOf(useCredits).returns.toHaveProperty('balance')
  expectTypeOf<ReturnType<typeof useCredits>['balance']>().toEqualTypeOf<ComputedRef<number | undefined>>()
})
