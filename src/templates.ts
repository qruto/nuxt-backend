import dedent from 'dedent'

const AUTH_CONFIG_TEMPLATE = `export { default } from 'nuxt-backend/convex/auth.config'\n`

const HTTP_TEMPLATE = dedent`
  import { setupEmail } from 'nuxt-backend/convex/email'
  import { httpRouter } from 'convex/server'
  import { components } from './_generated/api'
  import { httpAction } from './_generated/server'
  import { authComponent, createAuth } from './auth'
  import { polar, webhookEvents } from './billing'

  const http = httpRouter()
  authComponent.registerRoutes(http, createAuth)

  // Polar webhook (default path /polar/events). The component syncs
  // subscriptions/products; \`webhookEvents\` keeps the reactive feature/credit
  // cache fresh. Set POLAR_WEBHOOK_SECRET to verify events.
  polar.registerRoutes(http, { events: webhookEvents })

  // Resend delivery/bounce/open webhook → advances email status (makes
  // useEmailStatus reactive). Set RESEND_WEBHOOK_SECRET to verify signatures.
  const email = setupEmail(components.backend)
  http.route({
    path: '/resend-webhook',
    method: 'POST',
    handler: httpAction(async (ctx, request) => email.webhookHandler(ctx, request)),
  })

  export default http
  ` + '\n'

/**
 * Typed environment-variable declarations for the app (`defineApp({ env })`).
 * All optional so deploys validate while unconfigured features stay no-ops; the
 * generated `env` from `_generated/server` consumes them type-safely.
 */
const ENV_DECLARATION = dedent`
  env: {
      // Auth (Better Auth)
      BETTER_AUTH_SECRET: v.optional(v.string()),
      SITE_URL: v.optional(v.string()),
      // Email (Resend) — forwarded to the nested \`backend\` component below.
      RESEND_API_KEY: v.optional(v.string()),
      RESEND_FROM: v.optional(v.string()),
      RESEND_TEST_MODE: v.optional(v.string()),
      // Billing (Polar)
      POLAR_ORGANIZATION_TOKEN: v.optional(v.string()),
      POLAR_WEBHOOK_SECRET: v.optional(v.string()),
      POLAR_SERVER: v.optional(v.union(v.literal('sandbox'), v.literal('production'))),
    }`

const COMPONENT_IMPORTS = dedent`
  import aggregate from '@convex-dev/aggregate/convex.config'
  import migrations from '@convex-dev/migrations/convex.config'
  import polar from '@convex-dev/polar/convex.config'
  import rateLimiter from '@convex-dev/rate-limiter/convex.config'
  import workflow from '@convex-dev/workflow/convex.config'`

const COMPONENT_MOUNTS = dedent`
  // Resend is nested inside \`backend\`, so auth email works out of the box with
  // no separate mount. Components are isolated from the app's env, so forward
  // the email config by reference — the nested Resend client reads it at runtime.
  app.use(backend, {
    env: {
      RESEND_API_KEY: app.env.RESEND_API_KEY,
      RESEND_FROM: app.env.RESEND_FROM,
      RESEND_TEST_MODE: app.env.RESEND_TEST_MODE,
    },
  })
  app.use(aggregate)
  app.use(migrations)
  app.use(polar)
  app.use(rateLimiter)
  app.use(workflow)`

function convexConfigTemplate(backendImport: string): string {
  return dedent`
    import { defineApp } from 'convex/server'
    import { v } from 'convex/values'
    import backend from '${backendImport}'
    ${COMPONENT_IMPORTS}

    const app = defineApp({
      ${ENV_DECLARATION},
    })

    ${COMPONENT_MOUNTS}

    export default app
    ` + '\n'
}

/**
 * Feature setup files shared by both installation modes. Each is config-free and
 * degrades gracefully until its env vars are set.
 */
const FEATURE_FILE_TEMPLATES: Record<string, string> = {
  'billing.ts': dedent`
    import { setupBilling, type DiscountInput } from 'nuxt-backend/convex/billing'
    import { v } from 'convex/values'
    import { api, components } from './_generated/api'
    import { action, env } from './_generated/server'
    import { authComponent } from './auth'

    // Subscriptions, discounts & prepaid credits via the Polar component, linked to
    // your auth users. The reactive feature/credit cache lives inside the \`backend\`
    // component, so there's nothing to add to your schema. Set
    // POLAR_ORGANIZATION_TOKEN (and POLAR_SERVER) to enable checkout/credits/discounts.
    const billing = setupBilling(components.polar, components.backend, {
      organizationToken: env.POLAR_ORGANIZATION_TOKEN,
      server: env.POLAR_SERVER ?? 'sandbox',
      // Action context (checkout / sync): map the current user to a Polar customer.
      getUserInfo: async (ctx) => {
        const user = await ctx.runQuery(api.auth.getAuthUser, {})
        return { userId: user._id, email: user.email }
      },
      // Query context (reactive reads): resolve the current user id, or null when
      // signed out so reads degrade gracefully (e.g. during SSR).
      currentUserId: async (ctx) => {
        if (!(await ctx.auth.getUserIdentity())) return null
        return (await authComponent.getAuthUser(ctx))._id
      },
    })

    export const { polar } = billing
    // Checkout / portal / subscription functions (Polar) for \`useBilling\`.
    export const {
      generateCheckoutLink,
      generateCustomerPortalUrl,
      getConfiguredProducts,
      listAllProducts,
      listAllSubscriptions,
      changeCurrentSubscription,
      cancelCurrentSubscription,
    } = billing.api
    // Reactive queries + sync behind \`useBilling\` / \`useFeatures\` / \`useCredits\`.
    export const {
      getCurrentSubscription,
      getFeatures,
      getCredits,
      syncEntitlements,
    } = billing.functions
    // Webhook handlers (imported by http.ts) that keep the cache fresh.
    export const { webhookEvents } = billing

    // Discounts: create a percentage coupon (treat as an admin action).
    export const createDiscount = action({
      args: { name: v.string(), percent: v.number(), code: v.optional(v.string()) },
      handler: async (ctx, { name, percent, code }) => {
        const discount: DiscountInput = { type: 'percentage', name, code, duration: 'once', basisPoints: Math.round(percent * 100) }
        return billing.createDiscount(discount)
      },
    })

    // Credits are prepaid: a credit pack is a one-time Polar product whose Credits
    // benefit tops up a meter balance (\`useCredits().topUp(packId)\`). Spend them
    // from your own server code when a metered feature is used — \`spendCredits\`
    // blocks (throws) when the balance is too low, so credits are never billed as
    // overage. Uncomment and point \`meterId\` at your credit meter:
    //
    // export const consumeCredit = action({
    //   args: { meterId: v.string() },
    //   handler: async (ctx, { meterId }) => {
    //     const user = await ctx.runQuery(api.auth.getAuthUser, {})
    //     if (!user) throw new Error('Sign in to use credits.')
    //     await billing.spendCredits(ctx, { userId: user._id, name: 'credits', meterId })
    //   },
    // })
    ` + '\n',

  'email.ts': dedent`
    import { setupEmail } from 'nuxt-backend/convex/email'
    import { v } from 'convex/values'
    import { api, components } from './_generated/api'
    import { action } from './_generated/server'

    // Transactional + marketing email over the Resend component nested in
    // \`backend\`. Set RESEND_API_KEY to enable delivery (else it logs).
    const email = setupEmail(components.backend)

    // Reactive delivery-status query behind the \`useEmailStatus\` composable.
    export const { getEmailStatus } = email.api

    // Send a transactional email (gated: requires a signed-in user). The same
    // nested Resend transport powers auth OTP / verification / welcome.
    export const send = action({
      args: { to: v.string(), subject: v.string(), html: v.optional(v.string()), text: v.optional(v.string()) },
      returns: v.union(v.string(), v.null()),
      handler: async (ctx, args) => {
        const user = await ctx.runQuery(api.auth.getAuthUser, {})
        if (!user) throw new Error('Sign in to send email.')
        return email.send(ctx, args)
      },
    })

    // Marketing (audiences / contacts / broadcasts) via the Resend SDK. Treat as
    // admin actions — add your own authorization before exposing to clients.
    export const createAudience = action({
      args: { name: v.string() },
      handler: async (ctx, { name }) => email.audiences.create({ name }),
    })
    export const addContact = action({
      args: { audienceId: v.string(), email: v.string(), firstName: v.optional(v.string()), lastName: v.optional(v.string()) },
      handler: async (ctx, args) => email.contacts.add(args),
    })
    export const createBroadcast = action({
      args: { audienceId: v.string(), from: v.string(), subject: v.string(), html: v.string() },
      handler: async (ctx, args) => email.broadcasts.create(args),
    })
    export const sendBroadcast = action({
      args: { broadcastId: v.string() },
      handler: async (ctx, { broadcastId }) => email.broadcasts.send(broadcastId),
    })
    ` + '\n',

  'rateLimiter.ts': dedent`
    import { setupRateLimiter } from 'nuxt-backend/convex/rate-limit'
    import { components } from './_generated/api'

    // Application rate limiting. Pre-seeded with the auth limits (emailOtp,
    // signIn, signUp, passwordReset) — add your own named limits here.
    export const rateLimiter = setupRateLimiter(components.rateLimiter)
    ` + '\n',

  'workflows.ts': dedent`
    import { setupWorkflows } from 'nuxt-backend/convex/workflows'
    import { v } from 'convex/values'
    import { components } from './_generated/api'

    export const workflow = setupWorkflows(components.workflow)

    // Runs once on signup: send a welcome email through the Resend component
    // nested inside \`backend\`. Steps are durable and retried on failure.
    export const onSignup = workflow.define({
      args: { userId: v.string(), email: v.string(), name: v.string() },
      handler: async (step, { email, name }) => {
        await step.runMutation(components.backend.email.send, {
          to: email,
          subject: 'Welcome!',
          html: \`<p>Welcome aboard, \${name}! We're glad you're here.</p>\`,
        })
      },
    })
    ` + '\n',

  'migrations.ts': dedent`
    import { setupMigrations } from 'nuxt-backend/convex/migrations'
    import { components } from './_generated/api'

    // Online, batched schema migrations. Pass your schema for typed migrateOne:
    //   import schema from './schema'
    //   setupMigrations(components.migrations, { schema })
    export const { migrations, run } = setupMigrations(components.migrations)

    // Define migrations with migrations.define({ table, migrateOne }), then:
    //   npx convex run migrations:run '{ "fn": "migrations:yourMigration" }'
    ` + '\n',

  'aggregates.ts': dedent`
    // Denormalized counts/sums via the Aggregate component (mounted as
    // \`components.aggregate\`). Uncomment and adapt to a table in your schema —
    // here, a live count of rows in a \`messages\` table kept in sync by triggers:
    //
    // import { TableAggregate, Triggers, withTriggers } from 'nuxt-backend/convex/aggregate'
    // import { components } from './_generated/api'
    // import { mutation as rawMutation, query } from './_generated/server'
    // import type { DataModel } from './_generated/dataModel'
    //
    // export const messagesCount = new TableAggregate<{ Key: null, DataModel: DataModel, TableName: 'messages' }>(
    //   components.aggregate,
    //   { sortKey: () => null },
    // )
    //
    // const triggers = new Triggers<DataModel>()
    // triggers.register('messages', messagesCount.trigger())
    // export const mutation = withTriggers(rawMutation, triggers)
    //
    // export const countMessages = query({
    //   args: {},
    //   handler: (ctx) => messagesCount.count(ctx),
    // })
    export {}
    ` + '\n',

  'search.ts': dedent`
    // Type-safe full-text search over a Convex searchIndex. Add a search index to
    // a table in your schema:
    //   messages: defineTable({ text: v.string(), userId: v.string() })
    //     .searchIndex('search_text', { searchField: 'text', filterFields: ['userId'] })
    // then expose a search query and drive it from the client with \`useSearch\`:
    //
    // import { defineSearch } from 'nuxt-backend/convex/search'
    // import { query } from './_generated/server'
    //
    // export const searchMessages = defineSearch(query, {
    //   table: 'messages',
    //   index: 'search_text',
    //   searchField: 'text',
    // })
    export {}
    ` + '\n',
}

/**
 * Default `convex.config.ts`: one `defineBackendApp({ ... })` call mounts every
 * bundled component, declares their env vars, and forwards the email env to the
 * nested Resend component. The component definitions are imported here (Convex
 * builds its component tree from these imports) and handed to the helper.
 */
const DEFAULT_CONVEX_CONFIG = dedent`
  import { defineBackendApp } from 'nuxt-backend/convex/app'
  import backend from 'nuxt-backend/convex/component/convex.config'
  ${COMPONENT_IMPORTS}

  // One call mounts every bundled component (Better Auth + nested Resend email,
  // aggregate, migrations, Polar, rate limiter, workflows), declares their env
  // vars and forwards the email config to the nested Resend component. Pass extra
  // env via defineBackendApp(components, { env }), or call app.use(...) on the
  // returned app for your own components.
  export default defineBackendApp({ backend, aggregate, migrations, polar, rateLimiter, workflow })
  ` + '\n'

/**
 * Auto-scaffolded backend file templates.
 *
 * Each key is a filename relative to the backend functions directory;
 * the value is the file content that will be written when the file
 * does not yet exist.
 */
export const BACKEND_FILE_TEMPLATES: Record<string, string> = {
  'convex.config.ts': DEFAULT_CONVEX_CONFIG,
  'auth.config.ts': AUTH_CONFIG_TEMPLATE,
  'auth.ts': dedent`
    import { setupAuth } from 'nuxt-backend/convex'
    import { components, internal } from './_generated/api'
    import { query } from './_generated/server'
    import { rateLimiter } from './rateLimiter'
    import { workflow } from './workflows'

    export const {
      authComponent,
      createAuthOptions,
      options,
      createAuth,
      getAuthUser,
    } = setupAuth(components.backend, query, {
      integrations: {
        // Email (OTP / verification / reset) is delivered automatically through
        // the Resend component nested inside \`backend\` — just set RESEND_API_KEY.
        // Throttle OTP sends and other auth-sensitive flows.
        rateLimiter,
        // Kick off a durable welcome workflow when a user signs up.
        onUserCreated: async (ctx, user) => {
          await workflow.start(ctx, internal.workflows.onSignup, {
            userId: user.id,
            email: user.email,
            name: user.name,
          })
        },
      },
    })
    ` + '\n',
  'http.ts': HTTP_TEMPLATE,
  ...FEATURE_FILE_TEMPLATES,
}

export type BackendInstallationMode = 'default' | 'local'

export interface BackendTemplateOptions {
  installation?: BackendInstallationMode
}

export const LOCAL_BACKEND_FILE_TEMPLATES: Record<string, string> = {
  'convex.config.ts': convexConfigTemplate('./components/backend/convex.config'),
  'auth.config.ts': AUTH_CONFIG_TEMPLATE,
  'auth.ts': dedent`
    import { setupAuth } from 'nuxt-backend/convex'
    import { components, internal } from './_generated/api'
    import { query } from './_generated/server'
    import schema from './components/backend/schema'
    import { rateLimiter } from './rateLimiter'
    import { workflow } from './workflows'

    export const {
      authComponent,
      createAuthOptions,
      options,
      createAuth,
      getAuthUser,
    } = setupAuth(components.backend, query, {
      schema,
      integrations: {
        // Email is automatic via the nested Resend component (set RESEND_API_KEY).
        rateLimiter,
        onUserCreated: async (ctx, user) => {
          await workflow.start(ctx, internal.workflows.onSignup, {
            userId: user.id,
            email: user.email,
            name: user.name,
          })
        },
      },
    })
    ` + '\n',
  'http.ts': HTTP_TEMPLATE,
  'components/backend/convex.config.ts': dedent`
    import { defineComponent } from 'convex/server'

    export default defineComponent('backend')
    ` + '\n',
  'components/backend/generated-schema.ts': `export { tables } from 'nuxt-backend/convex/component/schema'\n`,
  'components/backend/schema.ts': dedent`
    import { defineSchema } from 'convex/server'
    import { tables } from './generated-schema'

    export default defineSchema({
      ...tables,
    })
    ` + '\n',
  'components/backend/adapter.ts': dedent`
    import { createApi } from '@convex-dev/better-auth'
    import { createAuthOptions } from '../../auth'
    import schema from './schema'

    export const {
      create,
      findOne,
      findMany,
      updateOne,
      updateMany,
      deleteOne,
      deleteMany,
    } = createApi(schema, createAuthOptions)
    ` + '\n',
  'components/backend/auth.ts': dedent`
    import { createAuth } from '../../auth'

    export const auth = createAuth({} as any)
    ` + '\n',
  ...FEATURE_FILE_TEMPLATES,
}

export function getBackendFileTemplates(options: BackendTemplateOptions = {}) {
  return options.installation === 'local'
    ? LOCAL_BACKEND_FILE_TEMPLATES
    : BACKEND_FILE_TEMPLATES
}
