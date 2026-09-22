import type { ComputedRef } from 'vue'
import type { AuthConfig, HttpRouter } from 'convex/server'
import type { WorkflowManager } from '@convex-dev/workflow'
import { describe, expectTypeOf, test } from 'vitest'
import type pkg from '../../package.json'
import backendModule, { type ModuleOptions } from 'nuxt-backend'
import { defaultEmailTemplates, setupAuth } from 'nuxt-backend/auth'
import { createAccessControl, setupAuthorization } from 'nuxt-backend/authorization'
import { registerBackendRoutes, setupMcp } from 'nuxt-backend/http'
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
import backendComponent from 'nuxt-backend/component/convex.config'
import schema, { vGift } from 'nuxt-backend/component/schema'
import { handleWebhook, send, status } from 'nuxt-backend/component/email'
import { debit, getByUser } from 'nuxt-backend/component/billing'
import { create, get } from 'nuxt-backend/component/gifts'
import { createRequest, getByStream } from 'nuxt-backend/component/ai'
import { find, record, vDeliveryOutcome } from 'nuxt-backend/component/webhooks'
import authConfig, { defineBackendAuthConfig } from 'nuxt-backend/auth.config'
import backendTest, { register } from 'nuxt-backend/test'
import { useCredits } from '../../src/runtime/vue/composables/use-credits'

// The typed subpaths are the product. Every runtime test imports a source file
// by path; nothing else imports `nuxt-backend/<subpath>` the way a consumer
// does and asserts what comes back. These assertions are the compile: vitest
// hands this file to tsc (the `types` project) and maps each type error to the
// `test` it sits in, so a failure names the subpath. A few load-bearing shapes
// per entry, not the whole surface — the export names are frozen in
// test/nuxt/public-surface.test.ts; this file pins the types behind the names
// a scaffolded app calls first.

/** `exports` keys that carry no TypeScript: self-reference, stylesheets, the Convex codegen output and its `.js` twins. */
type Untyped
  = | './package.json'
    | './auth.css'
    | './ui.css'
    | './*.css'
    | './component/_generated/component'
    | './component/_generated/component.js'
    | './component/convex.config.js'

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
    | './component/convex.config'
    | './component/schema'
    | './component/email'
    | './component/billing'
    | './component/gifts'
    | './component/ai'
    | './component/webhooks'
    | './auth.config'
    | './test'

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
  // `pages: false` is the documented way to keep the shipped pages out of an app.
  expectTypeOf<false>().toExtend<ModuleOptions['pages']>()
  expectTypeOf<ModuleOptions['mcp']>().toExtend<boolean | object | undefined>()
  expectTypeOf<ModuleOptions['css']>().toEqualTypeOf<boolean | undefined>()
})

// The Convex integrations — what a scaffolded `backend/*.ts` calls.
describe('integrations', () => {
  test('nuxt-backend/auth', () => {
    // The setup returns the pieces the scaffold re-exports.
    expectTypeOf(setupAuth).returns.toHaveProperty('getAuthUser')
    expectTypeOf(setupAuth).returns.toHaveProperty('createAuth')
    expectTypeOf(setupAuth).returns.toHaveProperty('authComponent')
    expectTypeOf(defaultEmailTemplates).toHaveProperty('otp')
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
    expectTypeOf(setupMcp).toBeFunction()
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
    expectTypeOf(setupBilling).parameter(1).toEqualTypeOf<SetupBillingConfig | undefined>()
    expectTypeOf(setupBilling).returns.toHaveProperty('provider')
    expectTypeOf(setupBilling).returns.toHaveProperty('api')
    expectTypeOf(defineBillingCatalog).toBeFunction()
    expectTypeOf(ALL_BILLING_EVENTS).toExtend<readonly string[]>()
  })

  test('nuxt-backend/email', () => {
    expectTypeOf(setupEmail).returns.toHaveProperty('send')
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
  })
})

test('nuxt-backend/mcp', () => {
  // The Nitro side of the agent surface.
  expectTypeOf(useBackendMcp).returns.toHaveProperty('session')
  expectTypeOf(useBackendMcp).returns.toHaveProperty('fetchQuery')
  expectTypeOf(defineBackendMcpTool).toBeFunction()
  expectTypeOf(BACKEND_MCP_FUNCTION_DEFAULTS).toBeObject()
})

// The component's own definition, schema and registered functions, exactly as
// `app.use()` and `convex-test` see them.
describe('component', () => {
  test('nuxt-backend/component/convex.config', () => {
    expectTypeOf(backendComponent).toHaveProperty('use')
  })

  test('nuxt-backend/component/schema', () => {
    expectTypeOf(schema.tables).toHaveProperty('user')
    expectTypeOf(schema.tables).toHaveProperty('billingGifts')
    expectTypeOf(schema.tables).toHaveProperty('aiRequests')
    expectTypeOf(schema.tables).toHaveProperty('webhookDeliveries')
    expectTypeOf(vGift.kind).toEqualTypeOf<'object'>()
  })

  // Each registered with the right builder and public to the app that mounts it.
  test('nuxt-backend/component/email', () => {
    expectTypeOf(send.isMutation).toEqualTypeOf<true>()
    expectTypeOf(send.isPublic).toEqualTypeOf<true>()
    expectTypeOf(status.isQuery).toEqualTypeOf<true>()
    expectTypeOf(handleWebhook.isAction).toEqualTypeOf<true>()
  })

  test('nuxt-backend/component/billing', () => {
    expectTypeOf(debit.isMutation).toEqualTypeOf<true>()
    expectTypeOf(getByUser.isQuery).toEqualTypeOf<true>()
  })

  test('nuxt-backend/component/gifts', () => {
    expectTypeOf(create.isMutation).toEqualTypeOf<true>()
    expectTypeOf(get.isQuery).toEqualTypeOf<true>()
  })

  test('nuxt-backend/component/ai', () => {
    expectTypeOf(createRequest.isMutation).toEqualTypeOf<true>()
    expectTypeOf(getByStream.isQuery).toEqualTypeOf<true>()
  })

  test('nuxt-backend/component/webhooks', () => {
    expectTypeOf(record.isMutation).toEqualTypeOf<true>()
    expectTypeOf(find.isQuery).toEqualTypeOf<true>()
    expectTypeOf(vDeliveryOutcome.kind).toEqualTypeOf<'union'>()
  })
})

// The auto-imported composables have no subpath; `useCredits` stands in for
// them because its result is the shape a template binds to first.
test('useCredits (auto-imported)', () => {
  expectTypeOf(useCredits).returns.toHaveProperty('balance')
  expectTypeOf<ReturnType<typeof useCredits>['balance']>().toEqualTypeOf<ComputedRef<number | undefined>>()
})
