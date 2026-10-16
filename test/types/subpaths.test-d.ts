import type { ComputedRef } from 'vue'
import type { AuthConfig, FunctionReturnType, HttpRouter } from 'convex/server'
import type { WorkflowManager } from '@convex-dev/workflow'
import { describe, expectTypeOf, test } from 'vitest'
import type pkg from '../../package.json'
import backendModule, { type ModuleOptions } from 'nuxt-backend'
import { setupAuth, type SetupAuthOptions } from 'nuxt-backend/auth'
import { createAccessControl, setupAuthorization } from 'nuxt-backend/authorization'
import { registerBackendRoutes } from 'nuxt-backend/http'
import { createFunctions } from 'nuxt-backend/functions'
import { backendEnv } from 'nuxt-backend/app'
import { ALL_BILLING_EVENTS, defineBillingCatalog, type SetupBillingConfig, setupBilling } from 'nuxt-backend/billing'
import type { ALL_EMAIL_EVENTS, EmailWebhookEventType } from 'nuxt-backend/email'
import { setupEmail } from 'nuxt-backend/email'
import { DEFAULT_LIMITS, MINUTE, setupRateLimiter } from 'nuxt-backend/rate-limit'
import { setupMigrations } from 'nuxt-backend/migrations'
import type { TableAggregate, Triggers } from 'nuxt-backend/aggregate'
import { withTriggers } from 'nuxt-backend/aggregate'
import { defineSearch, search } from 'nuxt-backend/search'
import { defineEmailSequence, setupWorkflows } from 'nuxt-backend/workflows'
import { priceTokens, setupAi } from 'nuxt-backend/ai'
import { BACKEND_MCP_FUNCTION_DEFAULTS, defineBackendMcpTool, useBackendMcp } from 'nuxt-backend/mcp'
import backendComponent from 'nuxt-backend/convex.config'
import authConfig, { defineBackendAuthConfig } from 'nuxt-backend/auth.config'
import backendTest, { asUser, defineBackendTestApp, register, seedWorkspace } from 'nuxt-backend/test'
import { BACKEND_ESLINT_RULES, backendEslint } from 'nuxt-backend/eslint'
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
    | './authorization'
    | './http'
    | './functions'
    | './app'
    | './billing'
    | './email'
    | './rate-limit'
    | './migrations'
    | './aggregate'
    | './search'
    | './workflows'
    | './ai'
    | './mcp'
    | './convex.config'
    | './auth.config'
    | './test'
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
  expectTypeOf<ModuleOptions['mcp']>().toExtend<object | undefined>()
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

  test('nuxt-backend/authorization', () => {
    // The guards `createFunctions` composes.
    expectTypeOf(setupAuthorization).returns.toHaveProperty('requireUser')
    expectTypeOf(setupAuthorization).returns.toHaveProperty('requireMember')
    expectTypeOf(createAccessControl).toBeFunction()
  })

  test('nuxt-backend/http', () => {
    // Mounts onto the app's router and returns nothing.
    expectTypeOf(registerBackendRoutes).parameter(0).toEqualTypeOf<HttpRouter>()
    expectTypeOf(registerBackendRoutes).returns.toBeVoid()
    // Every part is required: a route left out would answer 404 at its first call.
    expectTypeOf<Parameters<typeof registerBackendRoutes>[1]['billing']>().not.toBeNullable()
    expectTypeOf<Parameters<typeof registerBackendRoutes>[1]['email']>().not.toBeNullable()
    expectTypeOf<Parameters<typeof registerBackendRoutes>[1]['ai']>().not.toBeNullable()
    expectTypeOf<Parameters<typeof registerBackendRoutes>[1]['auth']>().toHaveProperty('mcp')
  })

  test('nuxt-backend/functions', () => {
    // The three tiers a scaffolded `functions.ts` exports.
    expectTypeOf(createFunctions).returns.toHaveProperty('authed')
    expectTypeOf(createFunctions).returns.toHaveProperty('org')
    expectTypeOf(createFunctions).returns.toHaveProperty('admin')
  })

  test('nuxt-backend/app', () => {
    // The env declaration `defineApp` receives — required vs optional is typed.
    expectTypeOf(backendEnv.AUTH_SECRET.isOptional).toEqualTypeOf<'required'>()
    expectTypeOf(backendEnv.EMAIL_API_KEY.isOptional).toEqualTypeOf<'optional'>()
  })

  test('nuxt-backend/billing', () => {
    expectTypeOf(setupBilling).parameter(1).toEqualTypeOf<SetupBillingConfig>()
    expectTypeOf<SetupBillingConfig['email']>().not.toBeNullable()
    expectTypeOf(setupBilling).returns.toHaveProperty('provider')
    expectTypeOf(setupBilling).returns.toHaveProperty('api')
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

  test('nuxt-backend/migrations', () => {
    expectTypeOf(setupMigrations).returns.toHaveProperty('migrations')
    expectTypeOf(setupMigrations).returns.toHaveProperty('run')
  })

  test('nuxt-backend/aggregate', () => {
    // The upstream classes come through with their methods intact.
    expectTypeOf<InstanceType<typeof TableAggregate>>().toHaveProperty('count')
    expectTypeOf<InstanceType<typeof Triggers>>().toHaveProperty('register')
    expectTypeOf(withTriggers).toBeFunction()
  })

  test('nuxt-backend/search', () => {
    expectTypeOf(defineSearch).toBeFunction()
    expectTypeOf(search).toBeFunction()
  })

  test('nuxt-backend/workflows', () => {
    expectTypeOf(setupWorkflows).returns.toEqualTypeOf<WorkflowManager>()
    expectTypeOf(defineEmailSequence).toBeFunction()
  })

  test('nuxt-backend/ai', () => {
    expectTypeOf(setupAi).returns.toHaveProperty('meteredAction')
    expectTypeOf(priceTokens).returns.toBeNumber()
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
    // A test app per call, and callers that carry a session's or an agent's claims.
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

test('nuxt-backend/mcp', () => {
  // The Nitro side of the agent surface.
  expectTypeOf(useBackendMcp).returns.toHaveProperty('session')
  expectTypeOf(useBackendMcp).returns.toHaveProperty('fetchQuery')
  expectTypeOf(defineBackendMcpTool).toBeFunction()
  expectTypeOf(BACKEND_MCP_FUNCTION_DEFAULTS).toBeObject()
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
