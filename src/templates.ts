import dedent from 'dedent'

const AUTH_CONFIG_TEMPLATE = `export { default } from 'nuxt-backend/auth.config'\n`

const HTTP_TEMPLATE = dedent`
  import { registerBackendRoutes } from 'nuxt-backend/http'
  import { httpRouter } from 'convex/server'
  import { authComponent, createAuth } from './auth'
  import { provider, webhookEvents } from './billing'
  import { email } from './email'

  // Mounts every inbound webhook the backend handles: the auth routes, the
  // billing events endpoint (/billing/events, BILLING_WEBHOOK_SECRET) that
  // keeps the reactive feature/credit cache fresh and fulfils gifts, and the
  // email events endpoint (/email/events, EMAIL_WEBHOOK_SECRET) that makes
  // useEmailStatus reactive. React to events via \`setupBilling({ events })\`
  // / \`setupEmail({ events })\`.
  const http = httpRouter()
  registerBackendRoutes(http, {
    auth: { authComponent, createAuth },
    billing: { provider, webhookEvents },
    email,
  })

  export default http
  ` + '\n'

/**
 * Local-install `convex.config.ts`: the whole `backend` component (and its
 * schema) is installed locally so it can be customized; the upstream
 * components still come bundled from the package — `defineBackendApp` mounts
 * them all, swapping in the local `backend` definition.
 */
const LOCAL_CONVEX_CONFIG = dedent`
  import { defineBackendApp } from 'nuxt-backend/app'
  import backend from './components/backend/convex.config'

  // The upstream components (aggregate, migrations, Polar, rate limiter,
  // workflows) still mount from the package; the all-in-one backend component
  // — and therefore its schema — is locally installed and customizable.
  export default defineBackendApp({ components: { backend } })
  ` + '\n'

/**
 * Feature setup files shared by both installation modes. Each is config-free —
 * the deployment env vars are the only configuration (AUTH_SECRET + SITE_URL
 * required; the rest optional with designed fallbacks — \`nuxt-backend env push\`
 * syncs them from .env.local).
 */
const FEATURE_FILE_TEMPLATES: Record<string, string> = {
  'functions.ts': dedent`
    import { setupAuthorization } from 'nuxt-backend/authorization'
    import { createFunctions } from 'nuxt-backend/functions'
    import { components } from './_generated/api'
    import { action, internalMutation, mutation, query } from './_generated/server'

    // Authorization over identity claims (role, ban state, active workspace),
    // with fresh reads where it matters. Bootstrap your first admin with:
    //   npx convex run functions:setUserRole '{"email":"you@example.com","role":"admin"}'
    export const authorization = setupAuthorization(components, { internalMutation })
    export const { setUserRole } = authorization

    // Pre-authorized builders — drop-in replacements for query/mutation/action:
    //   authed.query({ ... })            ctx.user (signed in, not banned)
    //   org.mutation({ ... })            + ctx.organization (fresh workspace membership)
    //   admin.action({ ... })            app-wide admin role
    //   withRole('editor').query({ .. }) custom role tier
    export const { authed, org, admin, withRole } = createFunctions(
      { query, mutation, action },
      authorization,
    )
    ` + '\n',

  'billing.ts': dedent`
    import { setupBilling, type DiscountInput } from 'nuxt-backend/billing'
    import { v } from 'convex/values'
    import { components } from './_generated/api'
    import { internalAction } from './_generated/server'

    // Subscriptions, discounts, prepaid credits & gift purchases. Billing
    // follows the tenant: with the default \`billTo: 'organization'\` the active
    // workspace owns the subscription and credits (members share them); switch to
    // \`billTo: 'user'\` for per-user B2C billing. The billing entity resolves from
    // identity claims automatically, configuration comes from the BILLING_* env
    // vars (optional — billing stays empty until BILLING_ACCESS_TOKEN is set),
    // and the reactive feature/credit cache lives inside the backend component —
    // nothing to add to your schema.
    const billing = setupBilling(components)

    export const { provider } = billing
    // Checkout / portal / subscription / gift functions for \`useBilling\`.
    export const {
      generateCheckoutLink,
      generateCustomerPortalUrl,
      getConfiguredProducts,
      listAllProducts,
      listAllSubscriptions,
      changeCurrentSubscription,
      cancelCurrentSubscription,
      giftCheckout,
    } = billing.api
    // Reactive queries + actions behind \`useBilling\` / \`useFeatures\` /
    // \`useCredits\` / \`useGifts\`.
    export const {
      getCurrentSubscription,
      getFeatures,
      getCredits,
      syncEntitlements,
      getReceivedGifts,
      claimGift,
    } = billing.functions
    // Webhook handlers (imported by http.ts) that keep the cache fresh.
    export const { webhookEvents } = billing

    // Discounts: mint a percentage coupon. This is privileged — a public action
    // would let anyone create a 100%-off code — so it ships as an internalAction:
    // run it from ops (\`npx convex run billing:createDiscount '{"name":"Launch","percent":20}'\`)
    // or your own server code. To expose it to an admin UI, re-declare it with
    // the \`admin.action\` builder from ./functions instead of internalAction.
    export const createDiscount = internalAction({
      args: { name: v.string(), percent: v.number(), code: v.optional(v.string()) },
      handler: async (ctx, { name, percent, code }) => {
        const basisPoints = Math.round(Math.min(Math.max(percent, 0), 100) * 100)
        const discount: DiscountInput = { type: 'percentage', name, code, duration: 'once', basisPoints }
        return billing.createDiscount(discount)
      },
    })

    // Credits are prepaid: a credit pack is a one-time product whose Credits
    // benefit tops up a meter balance (\`useCredits().topUp(packId)\` — or gift
    // one to someone else with \`useCredits().gift(packId, { recipientEmail })\`).
    // Spend them from your own server code when a metered feature is used —
    // \`spendCredits\` blocks (throws) when the balance is too low, so credits are
    // never billed as overage. Uncomment and point \`meterId\` at your credit meter:
    //
    // export const consumeCredit = action({
    //   args: { meterId: v.string() },
    //   handler: async (ctx, { meterId }) => {
    //     // The billing entity (active workspace or user) resolves from identity.
    //     await billing.spendCredits(ctx, { name: 'credits', meterId })
    //   },
    // })
    ` + '\n',

  'email.ts': dedent`
    import { setupEmail } from 'nuxt-backend/email'
    import { v } from 'convex/values'
    import { api, components } from './_generated/api'
    import { action, internalAction } from './_generated/server'

    // Transactional + marketing email over the backend component's email module.
    // Delivery uses the EMAIL_* env vars (optional — sends no-op until
    // EMAIL_API_KEY is set). React to delivery events with
    // \`setupEmail(components, { events: { onBounced: async (ctx, event) => { ... } } })\`.
    export const email = setupEmail(components)

    // Reactive delivery-status query behind the \`useEmailStatus\` composable.
    export const { getEmailStatus } = email.api

    // Send a transactional email (gated: requires a signed-in user). The same
    // transport powers auth OTP / verification / welcome / invitation email.
    export const send = action({
      args: { to: v.string(), subject: v.string(), html: v.optional(v.string()), text: v.optional(v.string()) },
      returns: v.union(v.string(), v.null()),
      handler: async (ctx, args) => {
        const user = await ctx.runQuery(api.auth.getAuthUser, {})
        if (!user) throw new Error('Sign in to send email.')
        return email.send(ctx, args)
      },
    })

    // Marketing (audiences / contacts / broadcasts) via the provider SDK. These
    // are privileged — a public action would be an open spam/phishing relay on
    // your verified domain — so they ship as internalActions: run them from ops
    // or your own server code. To expose one to an admin UI, re-declare it with
    // the \`admin.action\` builder from ./functions instead of internalAction.
    export const createAudience = internalAction({
      args: { name: v.string() },
      handler: async (ctx, { name }) => email.audiences.create({ name }),
    })
    export const addContact = internalAction({
      args: { audienceId: v.string(), email: v.string(), firstName: v.optional(v.string()), lastName: v.optional(v.string()) },
      handler: async (ctx, args) => email.contacts.add(args),
    })
    export const createBroadcast = internalAction({
      args: { audienceId: v.string(), from: v.string(), subject: v.string(), html: v.string() },
      handler: async (ctx, args) => email.broadcasts.create(args),
    })
    export const sendBroadcast = internalAction({
      args: { broadcastId: v.string() },
      handler: async (ctx, { broadcastId }) => email.broadcasts.send(broadcastId),
    })
    ` + '\n',

  'rateLimiter.ts': dedent`
    import { setupRateLimiter } from 'nuxt-backend/rate-limit'
    import { components } from './_generated/api'

    // Application rate limiting. Pre-seeded with the auth limits (emailOtp,
    // signIn, signUp, passwordReset) — add your own named limits here.
    export const rateLimiter = setupRateLimiter(components)
    ` + '\n',

  'workflows.ts': dedent`
    import { setupWorkflows } from 'nuxt-backend/workflows'
    import { v } from 'convex/values'
    import { components } from './_generated/api'

    export const workflow = setupWorkflows(components)

    // Runs once on signup: send a welcome email through the backend component's
    // email module. Steps are durable and retried on failure.
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
    import { setupMigrations } from 'nuxt-backend/migrations'
    import { components } from './_generated/api'

    // Online, batched schema migrations. Pass your schema for typed migrateOne:
    //   import schema from './schema'
    //   setupMigrations(components, { schema })
    export const { migrations, run } = setupMigrations(components)

    // Define migrations with migrations.define({ table, migrateOne }), then:
    //   npx convex run migrations:run '{ "fn": "migrations:yourMigration" }'
    ` + '\n',

  'aggregates.ts': dedent`
    // Denormalized counts/sums via the Aggregate component (mounted as
    // \`components.aggregate\`). Uncomment and adapt to a table in your schema —
    // here, a live count of rows in a \`messages\` table kept in sync by triggers:
    //
    // import { TableAggregate, Triggers, withTriggers } from 'nuxt-backend/aggregate'
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
    // import { defineSearch } from 'nuxt-backend/search'
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
 * Default `convex.config.ts`: zero component imports. `defineBackendApp()`
 * itself imports and mounts the all-in-one `backend` component (auth + email +
 * billing + gifts) plus the upstream components (aggregate, migrations, Polar,
 * rate limiter, workflows), declares the deployment env vars, and forwards the
 * email env.
 */
const DEFAULT_CONVEX_CONFIG = dedent`
  import { defineBackendApp } from 'nuxt-backend/app'

  // One call mounts the all-in-one backend component (auth, email, billing
  // cache, gifts) plus aggregate, migrations, Polar, rate limiter and
  // workflows, declares the deployment env vars (AUTH_SECRET + SITE_URL
  // required, the rest optional) and forwards the email config.
  // Customize via defineBackendApp({ omit, components, env }), or call
  // app.use(...) on the returned app for your own components.
  export default defineBackendApp()
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
    import { setupAuth } from 'nuxt-backend/auth'
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
      authConfig,
    } = setupAuth(components, query, {
      // Roles/permissions (admin plugin) and workspaces (organization plugin)
      // are on by default, including a personal workspace per user and emailed
      // workspace invitations with an /accept-invitation page. Customize or
      // disable: \`admin: false\`, \`organization: { personal: false }\`, ...
      integrations: {
        // Email (OTP / verification / invitations) is delivered automatically
        // through the backend component — configured by the EMAIL_* env vars.
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
  'convex.config.ts': LOCAL_CONVEX_CONFIG,
  'auth.config.ts': AUTH_CONFIG_TEMPLATE,
  'auth.ts': dedent`
    import { setupAuth } from 'nuxt-backend/auth'
    import { components, internal } from './_generated/api'
    import { query } from './_generated/server'
    import { authSchema } from './components/backend/schema'
    import { rateLimiter } from './rateLimiter'
    import { workflow } from './workflows'

    export const {
      authComponent,
      createAuthOptions,
      options,
      createAuth,
      getAuthUser,
      authConfig,
    } = setupAuth(components, query, {
      schema: authSchema,
      integrations: {
        // Email is automatic via the backend component (EMAIL_* env vars).
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
    import { v } from 'convex/values'
    import resend from '@convex-dev/resend/convex.config'

    // The locally installed all-in-one backend component. The email provider
    // component is nested inside, and the email env is declared here (the app
    // forwards the deployment's values — defineBackendApp does this for you).
    // Note: under pnpm, add \`@convex-dev/resend\` as a direct dependency so
    // this import resolves.
    const component = defineComponent('backend', {
      env: {
        EMAIL_API_KEY: v.optional(v.string()),
        EMAIL_FROM: v.optional(v.string()),
        EMAIL_TEST_MODE: v.optional(v.string()),
        EMAIL_WEBHOOK_SECRET: v.optional(v.string()),
      },
    })

    component.use(resend)

    export default component
    ` + '\n',
  'components/backend/generated-schema.ts': `export { tables, billingTables, vEntitlementBenefit, vEntitlementMeter, vGift } from 'nuxt-backend/component/schema'\n`,
  'components/backend/schema.ts': dedent`
    import { defineSchema } from 'convex/server'
    import { billingTables, tables } from './generated-schema'

    // Customize the auth tables here — add fields or your own tables. The
    // billing/gift tables come from the package; the default export is the
    // component's full schema.
    export const authSchema = defineSchema(tables)

    export default defineSchema({
      ...tables,
      ...billingTables,
    })
    ` + '\n',
  'components/backend/adapter.ts': dedent`
    import { createApi } from '@convex-dev/better-auth'
    import { createAuthOptions } from '../../auth'
    import { authSchema } from './schema'

    export const {
      create,
      findOne,
      findMany,
      updateOne,
      updateMany,
      deleteOne,
      deleteMany,
    } = createApi(authSchema, createAuthOptions)
    ` + '\n',
  'components/backend/email.ts': dedent`
    // The packaged email module (send / status / cancel + webhook over the
    // nested provider component). Inline the implementation to customize it.
    export { send, status, get, cancel, handleWebhook } from 'nuxt-backend/component/email'
    ` + '\n',
  'components/backend/billing.ts': dedent`
    // The packaged entitlement-cache module. Inline the implementation to
    // customize it.
    export { getByUser, upsert, clear, userByCustomer } from 'nuxt-backend/component/billing'
    ` + '\n',
  'components/backend/gifts.ts': dedent`
    // The packaged gift-purchase module. Inline the implementation to
    // customize it.
    export { create, markPaid, markClaimed, listByEmail, get, resolveRecipient } from 'nuxt-backend/component/gifts'
    ` + '\n',
  'components/backend/auth.ts': dedent`
    import { createAuth } from '../../auth'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export const auth = createAuth({} as any)
    ` + '\n',
  ...FEATURE_FILE_TEMPLATES,
}

export function getBackendFileTemplates(options: BackendTemplateOptions = {}) {
  return options.installation === 'local'
    ? LOCAL_BACKEND_FILE_TEMPLATES
    : BACKEND_FILE_TEMPLATES
}
