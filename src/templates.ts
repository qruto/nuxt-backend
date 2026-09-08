import dedent from 'dedent'
import { COMPONENT_MODULE_EXPORTS, SCHEMA_EXPORTS } from './templates.generated'

const AUTH_CONFIG_TEMPLATE = `export { default } from 'nuxt-backend/auth.config'\n`

const HTTP_TEMPLATE = dedent`
  import { registerBackendRoutes } from 'nuxt-backend/http'
  import { httpRouter } from 'convex/server'
  import { authComponent, createAuth, mcp } from './auth'
  import { billing } from './billing'
  import { email } from './email'
  import { ai } from './ai'

  // Mounts every inbound route the backend handles: the auth routes, the
  // billing events endpoint (/billing/events, BILLING_WEBHOOK_SECRET) that
  // keeps the reactive feature/credit cache fresh and fulfils gifts, the
  // email events endpoint (/email/events, EMAIL_WEBHOOK_SECRET) that makes
  // useEmailStatus reactive, the metered AI stream endpoint (/ai/stream),
  // and the agent token exchange (/mcp/exchange) behind the app's MCP
  // endpoint. Every webhook delivery is signature-verified, deduped, logged,
  // and fail-closed (503 until its secret is set). React to events via
  // \`setupBilling({ events })\` / \`setupEmail({ events })\`.
  const http = httpRouter()
  registerBackendRoutes(http, {
    auth: { authComponent, createAuth },
    billing,
    email,
    ai,
    mcp,
  })

  export default http
  ` + '\n'

/**
 * Local-install `convex.config.ts`: the same explicit app definition as
 * {@link DEFAULT_CONVEX_CONFIG}, but the whole `backend` component (and its
 * schema) is installed locally so it can be customized — the app mounts the
 * local definition; the upstream components still come bundled from the
 * package.
 */
const LOCAL_CONVEX_CONFIG = dedent`
  import { defineApp } from 'convex/server'
  import { backendEnv } from 'nuxt-backend/app'
  import aggregate from '@convex-dev/aggregate/convex.config'
  import migrations from '@convex-dev/migrations/convex.config'
  import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config'
  import polar from '@convex-dev/polar/convex.config'
  import rateLimiter from '@convex-dev/rate-limiter/convex.config'
  import workflow from '@convex-dev/workflow/convex.config'
  // The locally installed all-in-one backend component — and therefore its
  // schema — is customizable (see ./components/backend/schema.ts).
  import backend from './components/backend/convex.config'

  // Explicit on purpose. Convex discovers components by intercepting every
  // \`convex.config\` import while bundling this file, and current backends
  // reject the push (start_push 500) when such an import is reached through an
  // intermediate module or the components are mounted in a loop — so every
  // component is imported and mounted right here, one app.use() per component.
  // Mount your own components after them.
  //
  // The env contract is the package's: AUTH_SECRET + SITE_URL are required,
  // the rest optional with designed fallbacks (\`npx nuxt-backend env push\`
  // syncs them from .env.local). Extend it with your own vars:
  // defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })
  const app = defineApp({ env: backendEnv })

  // Components are isolated from the app env — forward the email config by
  // reference so the deployment's values reach the backend component (auth,
  // email, billing cache, gifts — the email provider is nested inside).
  app.use(backend, {
    env: {
      EMAIL_API_KEY: app.env.EMAIL_API_KEY,
      EMAIL_FROM: app.env.EMAIL_FROM,
      EMAIL_TEST_MODE: app.env.EMAIL_TEST_MODE,
      EMAIL_WEBHOOK_SECRET: app.env.EMAIL_WEBHOOK_SECRET,
    },
  })
  app.use(aggregate)
  app.use(migrations)
  app.use(persistentTextStreaming)
  app.use(polar)
  app.use(rateLimiter)
  app.use(workflow)

  export default app
  ` + '\n'

/**
 * Feature setup files shared by both installation modes. Each is config-free —
 * the deployment env vars are the only configuration (AUTH_SECRET + SITE_URL
 * required; the rest optional with designed fallbacks — \`nuxt-backend env push\`
 * syncs them from .env.local).
 */
const BILLING_CATALOG_TEMPLATE = dedent`
  import { defineBillingCatalog } from 'nuxt-backend/billing'

  // Your billing catalog as code: meters, plans, packs, feature benefits, and
  // the checkout fields they collect. Push it with
  // \`npx nuxt-backend billing sync\` — objects are created in the billing
  // provider (find-or-create, tagged, never deleted) and the id map lands in
  // billing.generated.ts. Credit granting is provider-native: a plan's
  // \`credits\` become a meter-credit benefit granted every cycle; a pack's are
  // granted once at purchase. A plan can also open with a free \`trial\` and
  // charge \`usage\` on top of its fixed price — pay-as-you-go overage settled
  // against the same meter at the end of each cycle.
  export default defineBillingCatalog({
    // meters: { credits: {} },
    // plans: {
    //   pro: {
    //     name: 'Pro', interval: 'month', price: 2900,
    //     credits: { meter: 'credits', units: 500 },
    //     features: ['priority_support'],
    //     trial: { interval: 'day', count: 14 },
    //     usage: [{ meter: 'credits', unitAmount: 5 }],
    //     customFields: ['company'],
    //   },
    // },
    // packs: {
    //   credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } },
    // },
    // features: {
    //   priority_support: { description: 'Priority support' },
    // },
    // customFields: {
    //   company: { type: 'text', name: 'Company' },
    // },
  })
  ` + '\n'

const BILLING_GENERATED_TEMPLATE = `/* Generated by \`npx nuxt-backend billing sync\` — do not edit. */
import type { BillingCatalogIds } from 'nuxt-backend/billing'

export const catalog: Partial<Record<'sandbox' | 'production', BillingCatalogIds>> = {}
`

const FEATURE_FILE_TEMPLATES: Record<string, string> = {
  'billing.catalog.ts': BILLING_CATALOG_TEMPLATE,
  'billing.generated.ts': BILLING_GENERATED_TEMPLATE,
  'ai.ts': dedent`
    import { setupAi } from 'nuxt-backend/ai'
    import { v } from 'convex/values'
    import { components } from './_generated/api'
    import { billing } from './billing'
    import { rateLimiter } from './rateLimiter'

    // The rails for selling metered AI features: every metered action/stream is
    // rate-limited (the 'ai' limit by default) and prepaid-credit-metered with
    // reserve → run → settle — a failed run consumes nothing. Usage lands in
    // the billing provider as ingested events (their portal shows it per
    // customer). Declare your credit meter in billing.catalog.ts.
    export const ai = setupAi(components, { billing, rateLimiter })

    // A metered action — swap the echo for your model call. Costs 1 credit
    // from the 'credits' meter per call (see billing.catalog.ts).
    export const transform = ai.meteredAction({
      meter: 'credits',
      args: { prompt: v.string() },
      handler: async (ctx, { prompt }) => {
        // const completion = await yourModel(prompt)
        return { echo: prompt.toUpperCase(), chargedTo: ctx.usage.entityId }
      },
    })

    // A metered, persisted token stream — drive it client-side with
    // \`useAiStream({ start: api.ai.startEcho, body: api.ai.echoBody })\`.
    // Reload mid-stream and the persisted text continues reactively.
    export const { start: startEcho, body: echoBody } = ai.stream({
      name: 'echo',
      meter: 'credits',
      args: { prompt: v.string() },
      handler: async (ctx, { prompt }, { append }) => {
        for (const word of prompt.split(' ')) {
          await append(word + ' ')
        }
      },
    })
    ` + '\n',
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
    import { catalog } from './billing.generated'

    // Subscriptions, discounts, prepaid credits & gift purchases. Billing
    // follows the tenant: with the default \`billTo: 'organization'\` the active
    // workspace owns the subscription and credits (members share them); switch to
    // \`billTo: 'user'\` for per-user B2C billing. The billing entity resolves from
    // identity claims automatically, configuration comes from the BILLING_* env
    // vars (optional — billing stays empty until BILLING_ACCESS_TOKEN is set),
    // and the reactive feature/credit cache lives inside the backend component —
    // nothing to add to your schema. The catalog (plans, packs, credit meters)
    // is declared in billing.catalog.ts and pushed with
    // \`npx nuxt-backend billing sync\`, which fills billing.generated.ts.
    // The instance is exported for ai.ts (metered actions spend through it).
    export const billing = setupBilling(components, { catalog })

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
      syncProducts,
      getReceivedGifts,
      claimGift,
      getWebhookDeliveries,
      // Subscription lifecycle — upgrade/downgrade, cancel, uncancel,
      // pause/resume. Each resolves the caller's own billing entity, so a
      // client can only ever act on its own subscription.
      updateSubscription,
      cancelSubscription,
      uncancelSubscription,
      pauseSubscription,
      resumeSubscription,
      // Order history, invoices and metered usage, read live from the provider
      // (this package keeps no local order or usage table — the provider is the
      // ledger).
      getOrders,
      getInvoiceUrl,
      getUsageHistory,
      // Admin-tier: gated by \`setupBilling({ requireAdmin })\`, which defaults
      // to an \`admin\` role claim on the caller's identity.
      refundOrder,
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
        return billing.discounts.create(discount)
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

    // Application rate limiting. Pre-seeded with the package defaults (emailOtp,
    // billingSync, ai, mcp) — add your own named limits here.
    export const rateLimiter = setupRateLimiter(components)
    ` + '\n',

  'workflows.ts': dedent`
    import { defineEmailSequence, setupWorkflows } from 'nuxt-backend/workflows'
    import { v } from 'convex/values'
    import { components } from './_generated/api'

    export const workflow = setupWorkflows(components)

    // Runs once on signup (started from auth.ts's onUserCreated): a durable
    // onboarding drip through the backend component's email module. Steps
    // sleep durably (they survive restarts and deploys), each email is
    // delivery-tracked, and a step returning null is skipped. Extend it, or
    // cancel a running sequence with \`workflow.cancel(ctx, id)\`.
    export const onSignup = defineEmailSequence(workflow, components, {
      args: { userId: v.string(), email: v.string(), name: v.string() },
      steps: [
        {
          after: 0,
          email: ({ email, name }) => ({
            to: email,
            subject: 'Welcome!',
            html: \`<p>Welcome aboard, \${name}! We're glad you're here.</p>\`,
          }),
        },
        // {
        //   after: 3 * 24 * 60 * 60 * 1000, // three days later
        //   email: ({ email, name }) => ({ to: email, subject: 'Getting the most out of it', text: '…' }),
        // },
      ],
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
 * Default `convex.config.ts`: the explicit app definition — every component
 * imported and mounted in the root file, one `app.use` each. Deliberately
 * NOT a one-call helper: current (2026-08) Convex backends crash the push
 * (`start_push 500`) when a `convex.config` import is reached through an
 * intermediate module or `app.use` runs in a loop. Mounts the all-in-one
 * `backend` component (auth + email + billing + gifts) plus the upstream
 * components (aggregate, migrations, persistent text streaming, Polar, rate
 * limiter, workflows), declares the deployment env via `backendEnv`, and
 * forwards the email env.
 */
const DEFAULT_CONVEX_CONFIG = dedent`
  import { defineApp } from 'convex/server'
  import { backendEnv } from 'nuxt-backend/app'
  import backend from 'nuxt-backend/component/convex.config'
  import aggregate from '@convex-dev/aggregate/convex.config'
  import migrations from '@convex-dev/migrations/convex.config'
  import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config'
  import polar from '@convex-dev/polar/convex.config'
  import rateLimiter from '@convex-dev/rate-limiter/convex.config'
  import workflow from '@convex-dev/workflow/convex.config'

  // Explicit on purpose. Convex discovers components by intercepting every
  // \`convex.config\` import while bundling this file, and current backends
  // reject the push (start_push 500) when such an import is reached through an
  // intermediate module or the components are mounted in a loop — so every
  // component is imported and mounted right here, one app.use() per component.
  // Mount your own components after them.
  //
  // The env contract is the package's: AUTH_SECRET + SITE_URL are required,
  // the rest optional with designed fallbacks (\`npx nuxt-backend env push\`
  // syncs them from .env.local). Extend it with your own vars:
  // defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })
  const app = defineApp({ env: backendEnv })

  // Components are isolated from the app env — forward the email config by
  // reference so the deployment's values reach the backend component (auth,
  // email, billing cache, gifts — the email provider is nested inside).
  app.use(backend, {
    env: {
      EMAIL_API_KEY: app.env.EMAIL_API_KEY,
      EMAIL_FROM: app.env.EMAIL_FROM,
      EMAIL_TEST_MODE: app.env.EMAIL_TEST_MODE,
      EMAIL_WEBHOOK_SECRET: app.env.EMAIL_WEBHOOK_SECRET,
    },
  })
  app.use(aggregate)
  app.use(migrations)
  app.use(persistentTextStreaming)
  app.use(polar)
  app.use(rateLimiter)
  app.use(workflow)

  export default app
  ` + '\n'

/**
 * Auto-scaffolded backend file templates.
 *
 * Each key is a filename relative to the backend functions directory;
 * the value is the file content that will be written when the file
 * does not yet exist.
 *
 * Exported for the scaffold tests; `getBackendFileTemplates` is the lookup
 * the scaffolder uses.
 *
 * @internal
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
      listWorkspaces,
      listWorkspaceMembers,
      updateProfile,
      // The agent token exchange (mounted at /mcp/exchange by http.ts) — the
      // app's OAuth-protected MCP endpoint calls Convex through it. Disable
      // the whole agent surface with \`mcp: false\`.
      mcp,
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
        // The onboarding sequence below sends its own welcome, so skip the
        // packaged welcome email (new users would get two otherwise).
        welcomeEmail: false,
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

type ComponentModule = keyof typeof COMPONENT_MODULE_EXPORTS
type SchemaExport = (typeof SCHEMA_EXPORTS)[number]

/**
 * A local-install re-export file: every value export of a packaged module —
 * taken from the generated list (`pnpm templates:generate`), so the scaffold
 * cannot drift from the component — re-exported from its package subpath,
 * under a note on what the module is.
 */
function reexportTemplate(names: readonly string[], specifier: string, note: readonly string[]) {
  return [
    ...note.map(line => `// ${line}`),
    'export {',
    ...names.map(name => `  ${name},`),
    `} from '${specifier}'`,
    '',
  ].join('\n')
}

/**
 * What each packaged function module does — the header of its re-export
 * file, ending with the customization hint.
 */
const COMPONENT_MODULE_NOTES: Record<ComponentModule, readonly string[]> = {
  ai: [
    'The packaged metered-AI request plumbing — the reserve → settle',
    'bookkeeping behind `setupAi().stream`. Inline the implementation to',
    'customize it.',
  ],
  billing: [
    'The packaged entitlement-cache module: the reactive feature/credit',
    'cache, reserve → settle credit spend, and benefit metadata. Inline the',
    'implementation to customize it.',
  ],
  email: [
    'The packaged email module (send / status / cancel + webhook over the',
    'nested provider component). Inline the implementation to customize it.',
  ],
  gifts: [
    'The packaged gift-purchase module. Inline the implementation to',
    'customize it.',
  ],
  webhooks: [
    'The packaged webhook delivery log — redelivery dedupe and the DevTools',
    'feed. Inline the implementation to customize it.',
  ],
}

/** `components/backend/<name>.ts` — a thin re-export of the packaged module. */
function componentModuleTemplate(name: ComponentModule) {
  return reexportTemplate(
    COMPONENT_MODULE_EXPORTS[name],
    `nuxt-backend/component/${name}`,
    COMPONENT_MODULE_NOTES[name],
  )
}

/**
 * The table groups the packaged schema spreads into the component's full
 * schema, in its order (the auth `tables` first — the base every install
 * customizes). Typed against the generated export list, so a renamed group
 * fails to compile here; the parity test checks that no group is missing.
 *
 * @internal
 */
export const SCHEMA_TABLE_GROUPS = ['tables', 'billingTables', 'aiTables', 'webhookTables'] as const satisfies readonly SchemaExport[]

/** `components/backend/generated-schema.ts` — every export of the packaged schema. */
const GENERATED_SCHEMA_TEMPLATE = reexportTemplate(SCHEMA_EXPORTS, 'nuxt-backend/component/schema', [
  'The packaged component schema — the auth tables, the billing / AI /',
  'webhook table groups, and the shared validators. Customize in ./schema.ts.',
])

/**
 * `components/backend/schema.ts` — the customizable auth schema plus the
 * component's full schema, composed of every packaged table group.
 */
const LOCAL_SCHEMA_TEMPLATE = [
  `import { defineSchema } from 'convex/server'`,
  `import { ${[...SCHEMA_TABLE_GROUPS].sort().join(', ')} } from './generated-schema'`,
  '',
  '// Customize the auth tables here — add fields or your own tables. The other',
  '// groups (billing/gift cache, AI request plumbing, webhook log) come from',
  '// the package; the default export is the component\'s full schema.',
  'export const authSchema = defineSchema(tables)',
  '',
  'export default defineSchema({',
  ...SCHEMA_TABLE_GROUPS.map(group => `  ...${group},`),
  '})',
  '',
].join('\n')

/**
 * The `installation: 'local'` counterpart of {@link BACKEND_FILE_TEMPLATES}:
 * the whole `backend` component installed under `components/backend/` so its
 * schema is customizable. Exported for the scaffold and parity tests.
 *
 * @internal
 */
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
      listWorkspaces,
      listWorkspaceMembers,
      updateProfile,
      // The agent token exchange (mounted at /mcp/exchange by http.ts).
      mcp,
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
    // forwards the deployment's values — the scaffolded convex.config.ts does
    // this for you).
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
  'components/backend/generated-schema.ts': GENERATED_SCHEMA_TEMPLATE,
  'components/backend/schema.ts': LOCAL_SCHEMA_TEMPLATE,
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
  'components/backend/email.ts': componentModuleTemplate('email'),
  'components/backend/billing.ts': componentModuleTemplate('billing'),
  'components/backend/gifts.ts': componentModuleTemplate('gifts'),
  'components/backend/ai.ts': componentModuleTemplate('ai'),
  'components/backend/webhooks.ts': componentModuleTemplate('webhooks'),
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
