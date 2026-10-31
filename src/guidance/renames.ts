/**
 * The rename map: the public names the previews of `main` renamed, reshaped
 * or removed before the first release, each tied to the Upgrade page
 * section that explains it. Every API-shaped name the page's Gone columns
 * list (a composable, a component, a factory, a type, a constant) that the
 * package no longer has is in here. Coding agents read it as
 * `skills/nuxt-backend/references/renames.json` and
 * `skills/nuxt-backend-upgrade/references/upgrade.md`, which `pnpm generate`
 * writes from this list, so an agent that remembers an old name finds the
 * new one in the installed package.
 *
 * It is reference data only. `nuxt-backend upgrade` rewrites none of an
 * app's code (it repairs the scaffold and runs the package's data
 * migrations), so an entry is never a codemod: the edit is the reader's.
 *
 * While the Upgrade page lists a section, it has entries here:
 * test/docs/agent-guidance.test.ts fails while a section has none, while an
 * entry names something its section does not, and while a Gone column lists
 * a removed API name no entry carries.
 */

/**
 * What happened to a name: `renamed`, the same thing under a new name;
 * `reshaped`, the same name called or read differently, `to` showing the new
 * shape; `removed`, gone, `to` naming what to use instead, or null when
 * nothing takes its place.
 */
export type RenameChange = 'renamed' | 'reshaped' | 'removed'

/** One entry of the rename map. */
export interface Rename {
  /** The old name or call, exactly as the Upgrade page spells it. */
  from: string
  /** The new name or call, as the Upgrade page spells it; null when nothing replaces it. */
  to: string | null
  change: RenameChange
  /** The heading of the Upgrade page section that explains it, without the `## `. */
  section: string
  /** What else changes, when the new name is not a drop-in replacement. */
  note?: string
}

/** The Upgrade page, which explains every entry in one of its sections. */
export const UPGRADE_PAGE = 'https://nuxt-backend.dev/docs/ship/releases/upgrade'

/** A heading's anchor on the docs site: lowercase words joined by `-`, punctuation and code ticks dropped. */
export function headingAnchor(heading: string): string {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
}

/** The link to the Upgrade page section a heading names. */
export function sectionUrl(section: string): string {
  return `${UPGRADE_PAGE}#${headingAnchor(section)}`
}

const ONE_WAY = 'One way to do each thing'
const ENVIRONMENT = 'One variable says what kind of deployment this is'
const SANDBOXES = 'Development runs on the providers\' sandboxes, with nothing simulated'
const DEFERRED = 'The MCP endpoint for your users\' agents waits for the next release'
const WORKSPACE_NAMES = 'Every public name says workspace, never organization'
const ERASURE = 'Deleting an account is immediate, and erases it everywhere'
const FREE_PLAN = 'The free plan is a subscription, and prices come in the visitor\'s currency'
const LAYOUT = 'Emails share one layout, and speak their recipient\'s language'
const IMPERSONATION = 'An impersonation lasts thirty minutes, and never visits an administrator'
const GATES = 'Feature gates match one key, and the server enforces them'
const PRICING = 'Plans have a monthly and a yearly price, and pricing renders on the server'
const STEP_UP = 'Sensitive actions ask for a recent sign-in'
const PANEL = 'The billing section follows the subscription, and cancelling takes one step'
const CAPABILITIES = '`doctor` and its JSON speak in capabilities'
const PASSKEY_LIMITS = 'Passkey sign-ins spend a limit, and the sign-in form opens on the last way in'
const DEV_PUSH = 'A dev push refuses a deploy key for another deployment'
const MAINTENANCE = 'The backend cleans up after itself, and secret emails leave no record'
const CONTRACT = 'The packaged UI keeps the component contract'
const LABELS = 'Every word is a label, and `@nuxtjs/i18n` translates them'
const DATA = 'Data composables take options and report failures in `error`'
const MANAGERS = 'Billing is managed by a workspace\'s owner and admins'
const AUTH = 'Auth composables resolve data and reject on failure'
const BILLING = 'Billing composables take options and report failures in `error`'
const CUSTOMERS = 'Each workspace pays through a customer of its own, and gifts are paid by the purchaser'
const CHECKOUT = 'Checkout sells only your catalog, and returns only to your site'
const REFUSALS = 'Refusals carry a code, and survive production'
const NEUTRAL = 'The surface says backend, never a provider'
const CODES = 'One-time codes are checked per address, and the unused routes are off'
const WORKSPACES = 'Workspace actions reject when they are refused'
const EMAIL = 'Every email comes from one registry, and every route is required'
const FACTORY = 'Email changes take a code from each address, and `setupAuth` is the one factory'
const WELCOME = 'The welcome email and both sign-in methods are always on'
const PAGES = 'Page paths, the stylesheet and the webhook log'
const ALWAYS_ON = 'Workspaces and admin are always on'
const LOCAL = 'Local installation is gone'
const SEND = 'The scaffolded `send` is internal'
const SESSIONS = 'Sessions are listed and revoked by id'

/** Every rename, newest section first, as the Upgrade page orders them. */
export const RENAMES: readonly Rename[] = [
  // One way per action. The boundaries, the banners, the auth members and
  // the wrapper subpaths each have one replacement.
  { from: 'setupAuthorization', to: 'createFunctions', change: 'removed', section: ONE_WAY, note: 'one call in `backend/functions.ts` takes `{ components, billing, rateLimiter }` and returns every tier and `setUserRole`' },
  { from: 'nuxt-backend/authorization', to: 'nuxt-backend/functions', change: 'renamed', section: ONE_WAY, note: '`RECENT_SIGN_IN_SECONDS` and `SENSITIVE_ACTIONS` are exported there too' },
  { from: 'requirePermission', to: 'withRole', change: 'removed', section: ONE_WAY, note: 'a role is a name: gate on an app-wide role' },
  { from: 'createAccessControl', to: null, change: 'removed', section: ONE_WAY, note: 'a role is a name; custom permissions wait for a later release' },
  { from: 'functionOptions', to: 'createFunctions', change: 'removed', section: ONE_WAY, note: 'its options go into the one `createFunctions` call' },
  { from: 'setupMigrations', to: 'Migrations', change: 'removed', section: ONE_WAY, note: '`new Migrations(components.migrations, { schema })` from `@convex-dev/migrations`, mounted in `convex.config.ts`' },
  { from: 'setupWorkpool', to: 'Workpool', change: 'removed', section: ONE_WAY, note: '`new Workpool(components.workpool, options)` from `@convex-dev/workpool`' },
  { from: 'setupCounter', to: 'ShardedCounter', change: 'removed', section: ONE_WAY, note: '`new ShardedCounter(components.shardedCounter)` from `@convex-dev/sharded-counter`' },
  { from: 'defineCache', to: 'ActionCache', change: 'removed', section: ONE_WAY, note: '`new ActionCache(components.actionCache, { action })` from `@convex-dev/action-cache`, mounted in `convex.config.ts`' },
  { from: 'setupCrons', to: 'Crons', change: 'removed', section: ONE_WAY, note: '`new Crons(components.crons)` from `@convex-dev/crons`, mounted in `convex.config.ts`' },
  { from: 'defineBackendCrons', to: 'cronJobs', change: 'removed', section: ONE_WAY, note: 'Convex\'s own `cronJobs()` in `crons.ts`' },
  { from: 'withTriggers', to: 'customMutation', change: 'removed', section: ONE_WAY, note: '`customMutation(mutation, customCtx(triggers.wrapDB))` from `convex-helpers`' },
  { from: 'billing.functions', to: 'billing.api', change: 'renamed', section: ONE_WAY },
  { from: 'email.devtools', to: 'email.api', change: 'renamed', section: ONE_WAY },
  { from: 'account.functions', to: 'account.api', change: 'renamed', section: ONE_WAY },
  { from: 'listWorkspaces', to: 'useWorkspace()', change: 'removed', section: ONE_WAY, note: '`setupAuth` no longer returns it' },
  { from: 'listWorkspaceMembers', to: 'useWorkspace()', change: 'removed', section: ONE_WAY, note: '`setupAuth` no longer returns it: `members`' },
  { from: '<RoleBoundary>', to: '<Gate>', change: 'renamed', section: ONE_WAY, note: '`role` stays a prop; `permission` has no counterpart' },
  { from: '<OrganizationBoundary>', to: '<Gate workspace>', change: 'removed', section: ONE_WAY, note: 'its default slot still receives `{ workspace }`' },
  { from: '<FeatureBoundary>', to: '<Gate>', change: 'renamed', section: ONE_WAY, note: '`feature` stays a prop; `plan` has no counterpart' },
  { from: '<QuotaBoundary>', to: '<Gate>', change: 'renamed', section: ONE_WAY, note: '`quota`, `amount`, `name` and `labels` stay props' },
  { from: '<ImpersonationBanner>', to: '<BackendNotices>', change: 'removed', section: ONE_WAY, note: 'its `impersonation` notice; place one `<BackendNotices>` in the layout' },
  { from: '<MaintenanceBanner>', to: '<BackendNotices>', change: 'removed', section: ONE_WAY, note: 'its `maintenance` notice' },
  { from: '<CreditsLowBanner>', to: '<BackendNotices>', change: 'removed', section: ONE_WAY, note: 'its `low-credits` notice, with `threshold` on the region' },
  { from: '<GiftClaimBanner>', to: '<BackendNotices>', change: 'removed', section: ONE_WAY, note: 'its `gift` notice' },
  { from: 'definePageMeta({ middleware: \'auth\' })', to: 'definePageMeta({ auth: true })', change: 'reshaped', section: ONE_WAY, note: 'the page guard is the one way; the named `auth` middleware is gone' },
  { from: 'auth: { permission }', to: 'auth: { role }', change: 'removed', section: ONE_WAY, note: 'a role is a name' },
  { from: 'auth: { workspaceRole }', to: 'auth: { workspace }', change: 'removed', section: ONE_WAY, note: '`workspace` also takes `true` for any member' },
  { from: 'useAuthState', to: 'useAuth', change: 'removed', section: ONE_WAY, note: '`isSignedIn` and `isLoading`' },
  { from: 'useAccountData', to: 'useAccount', change: 'renamed', section: ONE_WAY, note: 'it also saves the profile: `updateProfile`' },
  { from: 'useFlags', to: 'useFlagAdmin', change: 'renamed', section: ONE_WAY },
  { from: 'useAggregate', to: 'useQuery', change: 'removed', section: ONE_WAY, note: 'over the aggregate\'s own query' },
  { from: 'describeUserAgent', to: 'useSessions', change: 'removed', section: ONE_WAY, note: 'each session carries its `device` label' },
  { from: 'unwrapAuth', to: null, change: 'removed', section: ONE_WAY, note: 'every composable resolves with its data or rejects' },
  { from: 'useAuth().updateUser', to: 'useAccount().updateProfile', change: 'removed', section: ONE_WAY },
  { from: 'useAuth().deleteAccount', to: 'useAccount().deleteAccount', change: 'removed', section: ONE_WAY },
  { from: 'useAuth().registerPasskey', to: 'usePasskeys().add', change: 'removed', section: ONE_WAY },
  { from: 'useAuth().stopImpersonating', to: 'useAdmin().stopImpersonating', change: 'removed', section: ONE_WAY },
  { from: 'useAuth().lastSignInMethod', to: 'useLoginFlow().lastMethod', change: 'removed', section: ONE_WAY },
  { from: 'useAuth().isAuthenticated', to: 'isSignedIn', change: 'renamed', section: ONE_WAY },
  { from: 'useAuth().isImpersonating', to: 'impersonating', change: 'renamed', section: ONE_WAY },
  { from: 'useAuth().can', to: 'useAuth().hasRole', change: 'removed', section: ONE_WAY, note: 'a role is a name' },
  { from: 'useAuth().client', to: null, change: 'removed', section: ONE_WAY, note: 'sign in with `useLoginFlow`, and reach the rest through the composables' },
  // The mode variables become BACKEND_ENVIRONMENT. A value is not a name, so
  // no swap of the old one comes out right (`EMAIL_TEST_MODE=false` is
  // `BACKEND_ENVIRONMENT=production`, not `=false`).
  { from: 'EMAIL_TEST_MODE', to: 'BACKEND_ENVIRONMENT', change: 'removed', section: ENVIRONMENT, note: 'test mode everywhere but `production`; `EMAIL_TEST_MODE=false` is `BACKEND_ENVIRONMENT=production`; also remove it from the deployment and from `convex.config.ts`\'s forwards' },
  { from: 'BILLING_ENVIRONMENT', to: 'BACKEND_ENVIRONMENT', change: 'removed', section: ENVIRONMENT, note: 'the billing sandbox everywhere but `production`; also remove it from the deployment' },
  { from: 'MONITORING_ENVIRONMENT', to: 'BACKEND_ENVIRONMENT', change: 'removed', section: ENVIRONMENT, note: 'reports name `BACKEND_ENVIRONMENT`; also remove it from the deployment and from `convex.config.ts`\'s forwards' },
  { from: 'AUTH_TRUST_LOCAL_ORIGINS', to: 'BACKEND_ENVIRONMENT', change: 'removed', section: ENVIRONMENT, note: '`development` trusts the local origins; also remove it from the deployment' },
  { from: 'NUXT_BACKEND_LOG_OTP', to: 'BACKEND_ENVIRONMENT', change: 'removed', section: ENVIRONMENT, note: '`development` logs the sign-in codes; also remove it from the deployment' },
  { from: 'NUXT_PUBLIC_BACKEND_SITE_URL', to: 'NUXT_PUBLIC_BACKEND_URL', change: 'removed', section: ENVIRONMENT, note: 'the site origin derives from it; a custom domain or a self-hosted backend sets `NUXT_PUBLIC_CONVEX_SITE_URL`' },
  { from: 'SENTRY_DSN', to: 'MONITORING_DSN', change: 'removed', section: ENVIRONMENT, note: 'or the `NEXT_PUBLIC_SENTRY_DSN` Sentry\'s Vercel integration sets' },
  { from: 'backend.siteUrl', to: 'backend.url', change: 'removed', section: ENVIRONMENT, note: 'the site origin derives from it; the module refuses the option' },
  { from: 'backend.autoEnv', to: null, change: 'removed', section: ENVIRONMENT, note: '`nuxt-backend dev` provisions the dev deployment\'s env; the module refuses the option' },
  { from: 'backend.scaffold', to: null, change: 'removed', section: ENVIRONMENT, note: '`init` and `dev` own the scaffold; the module refuses the option' },
  { from: 'setupBilling({ environment })', to: null, change: 'removed', section: ENVIRONMENT, note: 'the billing environment follows `BACKEND_ENVIRONMENT`' },
  { from: 'deployment-auth-trust-local-origins', to: 'deployment-backend-environment', change: 'removed', section: ENVIRONMENT, note: 'a `doctor` finding, with `deployment-email-test-mode`, `deployment-billing-environment` and `deployment-monitoring-environment`' },
  // The simulators and the stand-in model: the providers' own sandboxes take
  // their place.
  { from: 'nuxt-backend simulate serve', to: null, change: 'removed', section: SANDBOXES, note: 'billing bills in Polar\'s sandbox: push a sandbox token and run `billing sync`' },
  { from: 'nuxt-backend simulate email', to: null, change: 'removed', section: SANDBOXES, note: 'send to Resend\'s test addresses and Resend posts the real event' },
  { from: 'BILLING_SIMULATOR_URL', to: null, change: 'removed', section: SANDBOXES, note: 'also remove it from the deployment' },
  { from: 'NUXT_BACKEND_SIMULATE_MODELS', to: null, change: 'removed', section: SANDBOXES, note: 'a call with no route is refused in development as in production' },
  { from: 'billing sync --env simulated', to: 'billing sync', change: 'reshaped', section: SANDBOXES, note: '`billing.generated.ts` keeps the `sandbox` and `production` maps only' },
  { from: 'billing-simulator', to: null, change: 'removed', section: SANDBOXES, note: 'a `doctor` finding, with the `billing.simulator_refused` and `ai.model_simulated` log codes' },
  { from: 'labels.admin.system.states.simulated', to: 'labels.admin.system.states.test', change: 'renamed', section: SANDBOXES, note: 'the capability state itself reads `test` in `status --json` and the health route' },
  { from: 'getSandboxInbox', to: 'getSandboxInbox', change: 'reshaped', section: SANDBOXES, note: 'a public action now: it reads Resend\'s log of sent email once the deployment opts in with `EMAIL_DEV_INBOX=1`, and the component\'s `sandboxInbox` table is gone' },
  // The end-user MCP endpoint and everything that only served it: there is
  // nothing to rename to.
  { from: 'nuxt-backend/mcp', to: null, change: 'removed', section: DEFERRED, note: 'the endpoint waits for the next release' },
  { from: 'useBackendMcp', to: null, change: 'removed', section: DEFERRED },
  { from: 'defineBackendMcpTool', to: null, change: 'removed', section: DEFERRED },
  { from: 'backend.mcp', to: null, change: 'removed', section: DEFERRED, note: 'the module refuses the option' },
  { from: '<AgentConsent>', to: null, change: 'removed', section: DEFERRED },
  { from: 'useAgentConsent', to: null, change: 'removed', section: DEFERRED },
  { from: 'backend.pages.agentConsent', to: null, change: 'removed', section: DEFERRED, note: 'the `/oauth/consent` page is gone' },
  { from: 'setupAuth({ mcp })', to: null, change: 'removed', section: DEFERRED, note: 'and the `mcp` that `setupAuth` returns' },
  { from: 'registerBackendRoutes(http, { auth: { authComponent, createAuth, mcp } })', to: 'registerBackendRoutes(http, { auth: { authComponent, createAuth }, billing, email, ai })', change: 'reshaped', section: DEFERRED, note: 'the `mcpExchangePath` option is gone with the route' },
  { from: 'authed.query({ scope })', to: null, change: 'removed', section: DEFERRED, note: 'on every tier, on `requireUser`, `requireMember` and the other checks, and on `setupAi`\'s metered actions and streams: no function takes an agent\'s token' },
  { from: 'AuthorizationUser.agentClientId', to: null, change: 'removed', section: DEFERRED, note: 'and `agentScopes`; `asUser({ agent })` is gone too' },
  { from: 'agent_token', to: null, change: 'removed', section: DEFERRED, note: 'a `forbidden` reason, with `insufficient_scope`' },
  { from: 'agent.authorized', to: null, change: 'removed', section: DEFERRED, note: 'an event kind, with `agent.revoked`' },
  { from: 'labels.agents', to: null, change: 'removed', section: DEFERRED },
  { from: 'doctor --only agents', to: 'doctor --only data', change: 'reshaped', section: DEFERRED, note: 'the `agents` capability is gone; `agent-files` and `agent-docs` are `data` findings' },
  { from: 'mcp-challenge', to: null, change: 'removed', section: DEFERRED, note: 'a `doctor` finding, with `mcp`, `agent-login-path`, `agent-consent-path` and `agent-discovery`' },
  // Some read differently, and some live in the app's own backend files.
  { from: 'useOrganization().organizations', to: 'workspaces', change: 'renamed', section: WORKSPACE_NAMES },
  { from: 'useOrganization()', to: 'useWorkspace()', change: 'renamed', section: WORKSPACE_NAMES, note: 'it also lists the pending `invitations` and changes members with `updateMemberRole` and `removeMember`' },
  { from: 'UseOrganizationReturn', to: 'UseWorkspaceReturn', change: 'renamed', section: WORKSPACE_NAMES },
  { from: 'setupAuth({ organization })', to: 'setupAuth({ workspaces })', change: 'renamed', section: WORKSPACE_NAMES },
  { from: 'organizationName', to: 'workspaceName', change: 'reshaped', section: WORKSPACE_NAMES, note: 'in the `invite` email\'s data and on an invitation; `organizationId` and `organizationSlug` are `workspaceId` and `workspaceSlug` on members and invitations, and in `invite`, `setActive` and `leave`' },
  { from: 'ctx.organization', to: 'ctx.workspace', change: 'reshaped', section: WORKSPACE_NAMES, note: 'the `org` tier is `workspace`, and `ctx.workspace` is `{ id, slug, name, role }`; `limits.org` is `limits.workspace`' },
  { from: 'org', to: 'workspace', change: 'reshaped', section: WORKSPACE_NAMES, note: 'the tier `createFunctions` returns: destructure `workspace` in `backend/functions.ts`' },
  { from: 'requireOrganization', to: 'requireWorkspace', change: 'reshaped', section: WORKSPACE_NAMES, note: 'resolves `{ user, workspace }`, the workspace as `ctx.workspace` has it' },
  { from: 'activeOrganizationId', to: 'activeWorkspaceId', change: 'reshaped', section: WORKSPACE_NAMES, note: 'on the user `getUser` reads, and `workspaceId` on `requireMember`\'s options and result; the token claim keeps its name' },
  { from: 'billTo: \'organization\'', to: 'billTo: \'workspace\'', change: 'reshaped', section: WORKSPACE_NAMES, note: 'still the default' },
  { from: 'labels.admin.system.layers', to: 'labels.admin.system.capabilities', change: 'renamed', section: WORKSPACE_NAMES, note: 'and `labels.admin.system.layer` is `labels.admin.system.capability`' },
  // The confirmation is the person's to type, and the erasure of an app's
  // tables is its own code.
  { from: 'useAuth().deleteAccount', to: 'useAuth().deleteAccount(confirmation)', change: 'reshaped', section: ERASURE, note: 'deletes now, with the address the person typed and a recent sign-in: wrap it in `useReauthentication().withReauthentication`, or render `<AccountData />`' },
  { from: '/delete-user', to: '/delete-user', change: 'reshaped', section: ERASURE, note: 'takes `{ confirmation }`, the account\'s address, spends the `accountDelete` limit, and refuses the only owner of a workspace others belong to (`forbidden`, reason `sole_owner`), as `/admin/remove-user` does' },
  { from: 'DeleteAccountEmailData', to: null, change: 'removed', section: ERASURE, note: 'deleting an account sends no email' },
  { from: 'setupEmail({ templates: { deleteAccount } })', to: null, change: 'removed', section: ERASURE, note: 'drop the override, and its `email.deleteAccount.*` labels' },
  { from: 'sendDeleteAccountVerification', to: null, change: 'removed', section: ERASURE, note: 'the package sets none; one your `authOptions.user.deleteUser` passes still sends its link' },
  { from: '<SecuritySettings @delete-requested>', to: '<AccountData>', change: 'removed', section: ERASURE, note: '`/security` renders it below `<SecuritySettings>`, whose `danger` section only signs this browser out' },
  { from: 'requestDeletion', to: '<AccountData>', change: 'removed', section: ERASURE, note: 'a `<SecuritySettings>` slot prop; `<AccountData>`\'s slots get `deleteAccount`' },
  { from: 'onUserDeleted', to: 'setupAccount({ sources })', change: 'reshaped', section: ERASURE, note: 'still runs after a deletion, for side effects; erasing your own tables belongs in a source of `setupAccount`, passed to `setupAuth({ account })`' },
  { from: 'audit.erasure_failed', to: 'account.erasure_failed', change: 'renamed', section: ERASURE, note: 'a log code, for an alert of yours' },
  { from: 'flags.erasure_failed', to: 'account.erasure_failed', change: 'renamed', section: ERASURE, note: 'a log code, for an alert of yours' },

  { from: 'useBilling().subscription', to: 'useBilling().isFree', change: 'reshaped', section: FREE_PLAN, note: 'the free plan is a subscription, marked `free: true`, where it read `null`: read `isFree` (still `true` on it), `isSubscribed` (still `false`) or `plan` (its key)' },
  { from: 'useBilling().status', to: 'useBilling().status', change: 'reshaped', section: FREE_PLAN, note: '`active` on the free plan, where it read `null`' },
  { from: 'useBilling().subscriptions', to: 'useBilling().subscriptions', change: 'reshaped', section: FREE_PLAN, note: 'lists the free plan\'s subscription too, marked `free: true` (and so does `getCurrentSubscription`\'s array with `multipleSubscriptions`): filter on `!free` for the paid plans' },
  { from: 'getOrders', to: 'getOrders', change: 'reshaped', section: FREE_PLAN, note: 'leaves out the subscription orders that charged nothing (a free plan\'s cycle, a trial\'s start, a cycle a full discount brought to nothing); `total` and `pageCount` still count them, so a page may list fewer than `limit`' },
  { from: 'billing.functions', to: 'startFreePlan', change: 'reshaped', section: FREE_PLAN, note: 'export `startFreePlan` from `backend/billing.ts` too: the free plan\'s queue runs `billing:startFreePlan` by that name, and `doctor` names it while it is missing' },

  { from: 'EmailRenderContext', to: 'EmailRenderContext', change: 'reshaped', section: LAYOUT, note: 'carries `link(url)`; `locale` and `t` are the recipient\'s language, and `brand` names the app after `EMAIL_FROM` before the `SITE_URL` host' },
  { from: 'defineEmailSequence', to: 'defineEmailSequence', change: 'reshaped', section: LAYOUT, note: 'every step\'s message goes into the layout, and a step gets the render context (`email` passes your brand and messages); a running run carries on' },

  { from: 'impersonationSessionDuration', to: 'impersonationSessionDuration', change: 'reshaped', section: IMPERSONATION, note: 'at most thirty minutes (`IMPERSONATION_SESSION_SECONDS`): a longer one, and Better Auth\'s default hour, are held to it' },
  { from: 'impersonate-admins', to: null, change: 'removed', section: IMPERSONATION, note: 'an administrator\'s account is never impersonated, whatever the roles grant: `forbidden`, reason `admin_target`' },
  { from: 'allowImpersonatingAdmins', to: null, change: 'removed', section: IMPERSONATION, note: 'no longer lets an administrator\'s account be impersonated' },
  { from: 'YOU_CANNOT_IMPERSONATE_ADMINS', to: 'admin_target', change: 'reshaped', section: IMPERSONATION, note: 'reads as `forbidden` with reason `admin_target`, as the package\'s own refusal does, no longer as reason `you_cannot_impersonate_admins`' },

  { from: 'useFeatures().has', to: 'useFeatures().has', change: 'reshaped', section: GATES, note: 'matches a benefit by its `key` metadata, else its benefit id, and nothing else: no grant id, provider type or other metadata value' },
  { from: '<FeatureBoundary feature>', to: '<FeatureBoundary feature>', change: 'reshaped', section: GATES, note: 'the same one key as `useFeatures().has()`' },
  { from: 'PricedPlan', to: 'PricedPlan', change: 'reshaped', section: GATES, note: 'has `featureKeys`: a test that answers `getPricing` gives each plan one' },

  { from: 'CatalogPlan.interval', to: 'CatalogPlan.prices', change: 'reshaped', section: PRICING, note: '`prices: { month?, year? }` in `billing.catalog.ts`, one product per price; `billing sync` refuses the old shape and prints the line to write' },
  { from: 'CatalogPlan.price', to: 'CatalogPlan.prices', change: 'reshaped', section: PRICING, note: 'the price at each interval it is sold at' },
  { from: 'CatalogPlan.credits', to: 'CatalogPlan.credits', change: 'reshaped', section: PRICING, note: 'a number of `units` is a month\'s allowance, granted twelve-fold on the yearly price; a plan billed yearly keeps its grant with `units: { year: <units> }`' },
  { from: 'CatalogPlan', to: 'CatalogPlan', change: 'reshaped', section: PRICING, note: '`prices` replaces `interval` and `price`; `retired: true` archives the plan' },
  { from: 'products.<plan>', to: 'products[\'<plan>:year\']', change: 'renamed', section: PRICING, note: 'in `billing.generated.ts`, for a plan billed yearly: `products.<plan>` names a plan\'s monthly price only, and `plans.<plan>` holds both' },
  { from: 'PricingPlan.credits', to: null, change: 'removed', section: PRICING, note: 'a card shows the live credit benefit, from `getPricing`' },
  { from: 'CreditPack.credits', to: null, change: 'removed', section: PRICING, note: 'a card shows the live credit benefit, from `getPricing`' },
  { from: 'pricing.period', to: 'pricing.period.month', change: 'reshaped', section: PRICING, note: 'and `pricing.period.year`' },
  { from: 'pricing.credits', to: 'pricing.credits.month', change: 'reshaped', section: PRICING, note: 'and `pricing.credits.year`' },
  { from: '<PricingTable>', to: '<PricingTable>', change: 'reshaped', section: PRICING, note: 'reads the scaffolded `getPricing` through `usePricing()` (export it from `backend/billing.ts`; a test answers `billing:getPricing`); the `period` prop is gone. `useBilling().products` is unchanged' },
  { from: 'ResolvedPlan', to: 'ResolvedPlan', change: 'reshaped', section: PRICING, note: '`offer`, `interval`, `priceAt` and `credits` where `product` was' },
  { from: 'ResolvedPack', to: 'ResolvedPack', change: 'reshaped', section: PRICING, note: '`offer` and its per-credit figures where `product` was' },
  { from: '<CreditsLowBanner>', to: '<CreditsLowBanner>', change: 'reshaped', section: PRICING, note: 'without `pack`, a member who manages billing gets `<button data-pack>` buying the smallest pack that covers the shortfall (`credits.topUpPack`); the pricing link stays for everyone else' },
  { from: 'changePlan', to: 'changePlan', change: 'reshaped', section: PRICING, note: 'from a yearly price to a monthly one the switch waits for the paid year\'s end, whatever `proration` says (`pendingChange`); so does `updateSubscription`' },
  { from: 'expiresAtCycleEnd', to: 'expiresAtCycleEnd', change: 'reshaped', section: PRICING, note: '`true` only when every benefit crediting the meter lapses' },

  { from: 'session.freshAge', to: 'session.freshAge', change: 'reshaped', section: STEP_UP, note: 'ten minutes (`RECENT_SIGN_IN_SECONDS`), set by the package over `authOptions.session.freshAge`; every sensitive action counts in it, and Better Auth\'s own `/list-sessions` too' },
  { from: 'SESSION_NOT_FRESH', to: 'reauthentication_required', change: 'reshaped', section: STEP_UP, note: 'reads as the catalog code, no longer as `forbidden` with reason `session_not_fresh`' },
  { from: 'SESSION_EXPIRED', to: 'reauthentication_required', change: 'reshaped', section: STEP_UP, note: 'reads as the catalog code, where it read as no code before' },
  { from: '`admin` tier', to: '`admin` tier', change: 'reshaped', section: STEP_UP, note: 'its mutations and actions take a sign-in from the last ten minutes unless the function says `recentSignIn: false`' },
  { from: 'refundOrder', to: 'refundOrder', change: 'reshaped', section: STEP_UP, note: 'takes a sign-in from the last ten minutes, like the scaffolded `sendAsAdmin`' },
  { from: '/delete-user', to: '/delete-user', change: 'reshaped', section: STEP_UP, note: 'with the passkey, workspace-deletion, membership, role and administrator routes, it answers `reauthentication_required` to a sign-in older than ten minutes: wrap the call in `useReauthentication().withReauthentication` and mount `<ReauthenticateDialog />`' },

  { from: '<WorkspaceSettings>', to: '<WorkspaceSettings>', change: 'reshaped', section: PANEL, note: '"Cancel plan" opens a one-step confirmation: press `[data-settings="confirm-cancel"]` to cancel, and read the state off `data-state`' },
  { from: '<PricingTable>', to: '<PricingTable>', change: 'reshaped', section: PANEL, note: 'the current plan\'s "Cancel plan" opens the same one-step confirmation: press `[data-pricing="confirm-cancel"]` to cancel' },
  { from: 'cancelPlan', to: 'cancelPlan', change: 'reshaped', section: PANEL, note: '<WorkspaceSettings>\'s slot action takes `{ reason, comment }`, the provider\'s own reason and the customer\'s words, sent with the cancellation' },
  { from: 'successUrl', to: '?checkout_return={CHECKOUT_ID}', change: 'reshaped', section: PANEL, note: 'the server appends it to plan, pack and gift-claim checkouts, and the module takes it off the address at once and refreshes the entitlements once; your own `checkout_id` stays' },
  { from: 'cancelSubscription', to: 'cancelSubscription', change: 'reshaped', section: PANEL, note: 'a second period-end cancel, an uncancel with nothing scheduled and a cancelPendingChange with no change are `invalid_input` with a reason, no longer `unavailable`; a comment over 500 characters is `invalid_input` on `comment`' },

  { from: 'AuthRateLimitName', to: 'AuthRateLimitName', change: 'reshaped', section: PASSKEY_LIMITS, note: 'adds `passkeySignIn` and `passkeySignInGlobal`: a `rateLimiter` of your own that lists limits by name needs both, or a passkey sign-in fails' },

  { from: 'env push', to: 'env push --prod', change: 'reshaped', section: DEV_PUSH, note: 'without `--prod` or `--preview`, `env push` and `doctor --fix` exit 1 unless `CONVEX_DEPLOY_KEY` is unset or a dev key; `nuxt-backend dev` and `autoEnv` skip the push' },

  { from: 'doctor --only deployment', to: 'doctor --only data', change: 'renamed', section: CAPABILITIES },
  { from: 'doctor --only scaffold', to: 'doctor --only data', change: 'renamed', section: CAPABILITIES },
  { from: 'doctor --only workspaces', to: 'doctor --only auth', change: 'renamed', section: CAPABILITIES },
  { from: 'findings[].service', to: 'findings[].capability', change: 'renamed', section: CAPABILITIES, note: 'in `doctor --json` and the DevTools panel\'s Copy doctor JSON; one of the capabilities' },
  { from: 'AccountDataRecord.layer', to: 'AccountDataRecord.capability', change: 'renamed', section: CAPABILITIES, note: 'on each participant of `ACCOUNT_DATA_SOURCES` in `nuxt-backend/account`: one of the capabilities, which the data map groups by' },

  { from: 'email.cleanup', to: 'setupEmail(components, { retention: { finalizedMs, abandonedMs } })', change: 'reshaped', section: MAINTENANCE, note: 'the component prunes the email records every hour; `retention` sets the windows, longer or shorter' },
  { from: 'sendTemplate', to: 'sendTemplate', change: 'reshaped', section: MAINTENANCE, note: '`null` for an `otp` email, which leaves no record and has no status' },
  { from: 'setupEmail', to: 'backend.email.sendSecret', change: 'reshaped', section: MAINTENANCE, note: 'a hand-written `components` object needs `backend.email.sendSecret`, which secret emails go through' },

  { from: 'useBilling().products', to: 'useBilling().products', change: 'reshaped', section: CONTRACT, note: '`{}` rather than `undefined` on a backend without `getConfiguredProducts`' },
  { from: '<AuthForm>', to: '<AuthForm>', change: 'reshaped', section: CONTRACT, note: 'a busy button is `aria-disabled`, not `disabled`: match `[aria-disabled="true"]`, not `button:disabled`' },
  { from: '<ProfileSettings>', to: '<ProfileSettings>', change: 'reshaped', section: CONTRACT, note: 'a busy save, submit or cancel button is `aria-disabled`, not `disabled`' },
  { from: '<SecuritySettings>', to: '<SecuritySettings>', change: 'reshaped', section: CONTRACT, note: 'a busy button is `aria-disabled`, not `disabled`; `disabled` stays on "sign out other sessions" with no other session' },
  { from: '<AcceptInvitation>', to: '<AcceptInvitation>', change: 'reshaped', section: CONTRACT, note: 'both answer buttons are `aria-disabled`, not `disabled`, while an answer is on its way' },
  { from: '<BillingHistory>', to: '<BillingHistory>', change: 'reshaped', section: CONTRACT, note: 'the pager buttons are `aria-disabled`, not `disabled`, while a page loads, and the one pressed reads `labels.history.pageLoading`; `disabled` stays for no page further' },
  { from: '<UsageHistory>', to: '<UsageHistory>', change: 'reshaped', section: CONTRACT, note: 'the pager buttons are `aria-disabled`, not `disabled`, while a page loads, and the one pressed reads `labels.usage.pageLoading`; `disabled` stays for no page further' },
  { from: '<PricingTable>', to: '<PricingTable>', change: 'reshaped', section: CONTRACT, note: 'a `loading` slot and status while the plans load; every packaged component types its slots and keeps a busy button focusable (`aria-disabled`)' },

  { from: 'labels.pricing.trial', to: 'labels.pricing.trial.day', change: 'reshaped', section: LABELS, note: 'one label per interval (`.day`, `.week`, `.month`, `.year`), each with `{count}`' },
  { from: 'labels.usage.units', to: '{count}', change: 'reshaped', section: LABELS, note: 'the placeholder is `{count}`, with plural forms' },
  { from: 'labels.auth.undeliverable.testMode', to: 'labels.errors.unavailable_test_mode', change: 'renamed', section: LABELS, note: 'a preview-only label: the client words the refusal' },
  { from: 'labels.auth.undeliverable.unconfigured', to: 'labels.errors.unavailable_unconfigured', change: 'renamed', section: LABELS, note: 'a preview-only label: the client words the refusal' },

  { from: 'useSearch(query, term, { debounce, args })', to: 'useSearch(query, { term, debounce, args })', change: 'reshaped', section: DATA },
  { from: 'UseSearchResult', to: 'UseSearchReturn', change: 'renamed', section: DATA },
  { from: 'useAggregate(query, args)', to: '{ data, isLoading, error }', change: 'reshaped', section: DATA, note: 'it returns an object; `data` is `undefined` until the first read' },
  { from: 'useCount', to: 'useQuery', change: 'removed', section: DATA, note: 'over the aggregate\'s own query: `useAggregate` went too' },
  { from: 'useWorkflowStatus(query, workflowId)', to: 'useWorkflowStatus(query, { workflowId })', change: 'reshaped', section: DATA },
  { from: 'useEmailStatus(emailId, { api })', to: 'useEmailStatus({ emailId, api })', change: 'reshaped', section: DATA },
  { from: 'useEmailStatus().isError', to: 'isFailed', change: 'renamed', section: DATA, note: '`error` now means the status could not be read' },
  { from: 'useSandboxInbox(address, { api })', to: 'useSandboxInbox({ address, api })', change: 'reshaped', section: DATA },
  { from: 'useSessions().error', to: 'error.message', change: 'reshaped', section: DATA, note: 'a `BackendError`, not a string; a failed read of the list sets it too, and `listError` holds that one alone' },
  { from: 'useSessions().revoke', to: 'useSessions().revoke', change: 'reshaped', section: DATA, note: 'rejects with what the call threw, not a new `Error`' },
  { from: 'useSessions().revokeOthers', to: 'useSessions().revokeOthers', change: 'reshaped', section: DATA, note: 'rejects with what the call threw, not a new `Error`' },
  { from: 'describeUserAgent()', to: 'describeUserAgent(ua) ?? \'Unknown device\'', change: 'reshaped', section: DATA, note: '`null` when there is nothing to describe, never `\'unknown device\'` or `\'Browser\'`' },

  { from: 'billing.resolveEntity', to: 'billing.requireEntity(ctx, rule)', change: 'reshaped', section: MANAGERS, note: '`resolveEntity` is still there and checks nobody; to act for the entity, call `requireEntity`' },

  { from: 'useAuth(initialToken)', to: 'useAuth()', change: 'reshaped', section: AUTH, note: 'the module prefetches the token' },
  { from: 'UseBackendAuthService', to: 'UseAuthReturn', change: 'renamed', section: AUTH },
  { from: 'registerPasskey(context)', to: 'registerPasskey({ name, context, authenticatorAttachment, … })', change: 'reshaped', section: AUTH },
  { from: 'useLoginFlow().pending', to: 'isPending', change: 'renamed', section: AUTH, note: '`error` is a `BackendError`' },
  { from: 'useEmailChange().pending', to: 'isPending', change: 'renamed', section: AUTH },

  { from: 'useCredits(\'credits\', { api })', to: 'useCredits({ meter: \'credits\', api })', change: 'reshaped', section: BILLING },
  { from: 'useBilling().pendingUpdate', to: 'pendingChange', change: 'renamed', section: BILLING, note: '`{ productId, appliesAt: Date } | null`' },
  { from: 'useBilling().pausedAt', to: 'isPaused', change: 'removed', section: BILLING, note: '`resumesAt` says when a paused subscription resumes' },
  { from: 'useGifts().isClaiming', to: 'isPending', change: 'renamed', section: BILLING },

  { from: 'useGifts({ autoClaim })', to: 'useGifts().claim(giftId)', change: 'removed', section: CUSTOMERS, note: 'the recipient claims each gift' },
  { from: '<GiftClaimBanner auto-claim>', to: 'useGifts().claim(giftId)', change: 'removed', section: CUSTOMERS },
  { from: 'billing_profile_mismatch', to: null, change: 'removed', section: CUSTOMERS },

  { from: 'gift(productIds, …)', to: 'useGifts().send(item, …)', change: 'reshaped', section: CHECKOUT, note: 'a credit pack\'s catalog key, or a plan\'s key with `months` for a plan pass; it moved off `useBilling` and `useCredits`' },
  { from: 'discountId', to: 'discountCode', change: 'reshaped', section: CHECKOUT, note: 'from the browser; a discount by id goes through `billing.checkout(ctx, { discountId })` on the server' },
  { from: 'trialInterval', to: null, change: 'removed', section: CHECKOUT, note: 'the plan\'s own `trial` from the catalog; a different one only from server code' },
  { from: 'listAllProducts', to: 'getConfiguredProducts', change: 'removed', section: CHECKOUT },
  { from: 'changeCurrentSubscription', to: 'updateSubscription', change: 'removed', section: CHECKOUT, note: '`changePlan` on `useBilling()`' },
  { from: 'cancelCurrentSubscription', to: 'cancelSubscription', change: 'removed', section: CHECKOUT, note: '`cancel` on `useBilling()`' },

  { from: 'error.data', to: 'getBackendError(error)', change: 'reshaped', section: REFUSALS, note: 'a refusal carries a stable `code`; branch on it and show `message`' },

  { from: 'useConvex()', to: 'useBackendClient()', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexQuery', to: 'useQuery', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexQueries', to: 'useQueries', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexMutation', to: 'useMutation', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexAction', to: 'useAction', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexPaginatedQuery', to: 'usePaginatedQuery', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexAsyncQuery', to: 'useAsyncQuery', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexAsyncPaginatedQuery', to: 'useAsyncPaginatedQuery', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexUpload', to: 'useUpload', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexUploadQueue', to: 'useUploadQueue', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexStorageUrl', to: 'useStorageUrl', change: 'renamed', section: NEUTRAL },
  { from: 'useConvexAuth()', to: 'useAuth()', change: 'removed', section: NEUTRAL, note: 'its `isSignedIn` and `isLoading`: `useAuthState` went too' },
  { from: 'useConvexConnectionState()', to: 'useConnectionState()', change: 'renamed', section: NEUTRAL },
  { from: 'useBetterAuth()', to: 'useAuth()', change: 'renamed', section: NEUTRAL, note: '`useAuth()` extends it' },
  { from: 'provideConvexAuth', to: null, change: 'removed', section: NEUTRAL, note: 'no longer auto-imported: import it from `nuxt-convex-module/client`' },
  { from: 'provideConvexApi', to: null, change: 'removed', section: NEUTRAL, note: 'gone from nuxt-convex-module 0.12: pass function references explicitly, or let the composables read the generated `api` this package provides' },
  { from: 'useConvexApi', to: null, change: 'removed', section: NEUTRAL, note: 'gone from nuxt-convex-module 0.12: pass function references explicitly, or let the composables read the generated `api` this package provides' },
  { from: 'useConvexNamespace', to: null, change: 'removed', section: NEUTRAL, note: 'gone from nuxt-convex-module 0.12: pass function references explicitly, or let the composables read the generated `api` this package provides' },
  { from: '<ConvexProviderWithClerk>', to: null, change: 'removed', section: NEUTRAL, note: 'no longer auto-imported: import it from `nuxt-convex-module/clerk/vue`' },
  { from: 'provideConvexAuthFromClerk', to: null, change: 'removed', section: NEUTRAL, note: 'no longer auto-imported: import it from `nuxt-convex-module/clerk/vue`' },
  { from: '<ConvexProviderWithAuth0>', to: null, change: 'removed', section: NEUTRAL, note: 'no longer auto-imported: import it from `nuxt-convex-module/auth0/vue`' },
  { from: 'provideConvexAuthFromAuth0', to: null, change: 'removed', section: NEUTRAL, note: 'no longer auto-imported: import it from `nuxt-convex-module/auth0/vue`' },
  { from: '<ConvexImage>', to: '<StorageImage>', change: 'renamed', section: NEUTRAL },
  { from: '<CheckoutLink>', to: '<BillingCheckoutLink>', change: 'renamed', section: NEUTRAL },
  { from: '<CustomerPortalLink>', to: '<BillingPortalLink>', change: 'renamed', section: NEUTRAL },
  { from: 'definePageMeta({ middleware: \'convex-auth\' })', to: 'definePageMeta({ auth: true })', change: 'reshaped', section: NEUTRAL, note: 'the page guard, with no middleware to name' },
  { from: 'convexAuth(event)', to: 'backendAuth(event)', change: 'renamed', section: NEUTRAL },
  { from: 'convexBetterAuthNuxt', to: null, change: 'removed', section: NEUTRAL, note: 'import it from `nuxt-convex-module/better-auth/server`' },
  { from: 'export const { provider } = billing', to: null, change: 'removed', section: NEUTRAL, note: 'the provider\'s client stays inside `setupBilling`; use `billing.api` and `billing.functions`' },
  { from: 'setupBilling({ getUserInfo, currentUserId })', to: 'setupBilling({ resolveEntity })', change: 'reshaped', section: NEUTRAL },
  { from: 'BILLING_REFRESH_EVENTS', to: null, change: 'removed', section: NEUTRAL, note: '`billing sync` registers the webhook events itself' },
  { from: 'BILLING_WEBHOOK_PROVISION_EVENTS', to: null, change: 'removed', section: NEUTRAL, note: '`billing sync` registers the webhook events itself' },
  { from: 'sendArgs', to: null, change: 'removed', section: NEUTRAL, note: 'the scaffolded `send` is internal and takes its own validator' },

  { from: '/email-otp/check-verification-otp', to: null, change: 'removed', section: CODES, note: 'the route answers 404; the code routes check a code as they consume it' },
  { from: '/send-verification-email', to: null, change: 'removed', section: CODES, note: 'verification goes by code' },
  { from: '/change-email', to: null, change: 'removed', section: CODES, note: 'an email change goes by code' },

  { from: 'const { error } = await invite({ email })', to: 'try { await invite({ email }) } catch (error) { … }', change: 'reshaped', section: WORKSPACES, note: 'every `useOrganization()` action rejects when refused' },

  { from: 'emailTemplates', to: 'setupEmail(components, { templates })', change: 'removed', section: EMAIL, note: '`setupEmail` holds every email the package sends' },
  { from: 'giftEmail', to: null, change: 'removed', section: EMAIL, note: 'restyle the `gift` template on `setupEmail`' },
  { from: 'defaultGiftEmail', to: null, change: 'removed', section: EMAIL, note: 'restyle the `gift` template on `setupEmail`' },
  { from: 'GiftEmailMessage', to: null, change: 'removed', section: EMAIL, note: '`GiftEmailData` comes from `nuxt-backend/email`' },
  { from: 'AuthEmailSender', to: 'AuthEmail', change: 'renamed', section: EMAIL },
  { from: 'AuthEmailMessage', to: 'EmailMessage', change: 'renamed', section: EMAIL },
  { from: 'AuthEmailTemplates', to: 'EmailTemplates', change: 'renamed', section: EMAIL },
  { from: 'AuthEmailTemplateOverrides', to: 'EmailTemplateOverrides', change: 'renamed', section: EMAIL },
  { from: 'setupBilling(components)', to: 'setupBilling(components, { email })', change: 'reshaped', section: EMAIL },
  { from: 'registerBackendRoutes(http, { auth: { authComponent, createAuth }, mcp, … })', to: 'registerBackendRoutes(http, { auth: { authComponent, createAuth }, billing, email, ai })', change: 'reshaped', section: EMAIL, note: 'every part is required' },

  { from: 'setupAuth(components, query, { integrations: { rateLimiter, canSignIn, onUserCreated, onUserDeleted, email, emailTemplates } })', to: 'setupAuth(components, query, { rateLimiter, … })', change: 'reshaped', section: FACTORY },
  { from: 'createAuthOptions', to: 'createAuth', change: 'removed', section: FACTORY },
  { from: 'createAuth', to: 'setupAuth', change: 'reshaped', section: FACTORY, note: 'no longer exported from `nuxt-backend/auth`: `setupAuth` returns it' },
  { from: 'createBetterAuth', to: 'setupAuth', change: 'removed', section: FACTORY, note: '`setupAuth` returns `createAuth` and the auth queries' },
  { from: 'createBetterAuthOptions', to: 'setupAuth', change: 'removed', section: FACTORY },
  { from: 'makeAuthApi', to: 'setupAuth', change: 'removed', section: FACTORY },
  { from: 'defaultEmailTemplates', to: 'byDefault', change: 'removed', section: FACTORY, note: 'an override receives the default it replaces' },
  { from: 'CreateBetterAuthOptions', to: 'SetupAuthOptions', change: 'renamed', section: FACTORY },
  { from: 'useAuth().changeEmail', to: 'useEmailChange()', change: 'removed', section: FACTORY, note: '`start`, `confirmCurrent`, `verifyNew`' },
  { from: 'useAuth().sendVerificationEmail', to: 'useEmailChange()', change: 'removed', section: FACTORY, note: 'the code that signs a person in verifies their address' },
  { from: '<ProfileSettings callback-path>', to: null, change: 'removed', section: FACTORY, note: 'listen to `email-changed(email)`' },

  { from: 'welcomeEmail', to: null, change: 'removed', section: WELCOME, note: 'restyle the `welcome` template on `setupEmail`' },
  { from: '<AuthForm :passkeys>', to: null, change: 'removed', section: WELCOME, note: 'build your own page on `useLoginFlow()` for a different set of steps' },
  { from: 'useLoginFlow({ offerPasskey })', to: 'skipPasskey()', change: 'removed', section: WELCOME, note: 'after a code the flow offers to save a passkey' },
  { from: 'defineEmailSequence', to: 'defineEmailSequence', change: 'reshaped', section: WELCOME, note: 'a run started with a `userId` reads the account before each email, so one that already sent an email fails at its next wake whatever its export; let it finish, cancel it, or keep it on a `workflow.define` copy of the old loop' },

  { from: 'backend.pages: false', to: 'backend.pages.<key>: false', change: 'reshaped', section: PAGES, note: 'turn each page off by its key' },
  { from: 'backend.loginPath', to: 'backend.pages.login', change: 'renamed', section: PAGES },
  { from: 'setupAuth({ basePath })', to: 'backend.authRoute', change: 'removed', section: PAGES, note: 'the module writes it to paths.generated.ts, whose `paths` the scaffold passes to setupAuth and defineBackendAuthConfig' },
  { from: 'defineBackendAuthConfig({ basePath })', to: 'defineBackendAuthConfig({ paths })', change: 'reshaped', section: PAGES, note: 'the `paths` of paths.generated.ts, which the module writes from `backend.authRoute`' },
  { from: 'setupAuth({ workspaces: { invitationPath } })', to: 'backend.pages.acceptInvitation', change: 'removed', section: PAGES, note: 'through paths.generated.ts' },
  { from: 'setupAccount({ keepPath })', to: 'backend.pages.keepAccount', change: 'removed', section: PAGES, note: 'through paths.generated.ts' },
  { from: 'nuxt-backend/ui.css', to: null, change: 'removed', section: PAGES, note: 'the module adds the stylesheet' },
  { from: 'setupBilling({ deliveryLog })', to: null, change: 'removed', section: PAGES, note: 'every webhook delivery is logged' },
  { from: 'setupBilling({ benefitMetadataTtlMs })', to: null, change: 'removed', section: PAGES },
  { from: 'billing.api.getWebhookDeliveries', to: 'webhooks.api.getWebhookDeliveries', change: 'renamed', section: PAGES, note: 're-exported from backend/webhooks.ts (setupWebhooks, from nuxt-backend/admin), beside replayWebhookDelivery' },

  { from: 'backend.workspaces', to: null, change: 'removed', section: ALWAYS_ON, note: 'workspaces are always on' },
  { from: 'setupAuth({ admin: false })', to: null, change: 'removed', section: ALWAYS_ON },
  { from: 'setupAuth({ verbose })', to: null, change: 'removed', section: ALWAYS_ON },

  { from: 'installation: \'local\'', to: null, change: 'removed', section: LOCAL, note: 'every app mounts the packaged component, which owns its schema' },
  { from: 'init --installation', to: null, change: 'removed', section: LOCAL },
  { from: 'nuxt-backend/component/*', to: 'nuxt-backend/convex.config', change: 'removed', section: LOCAL },

  { from: 'api.email.send', to: 'internal.email.send', change: 'reshaped', section: SEND, note: 'an `internalAction`: call it from server code with an address you trust' },

  { from: 'useSessions().revoke', to: 'useSessions().revoke(id)', change: 'reshaped', section: SESSIONS, note: 'a session id instead of a token; the list is live, so `refresh()` and `immediate` are gone' },
]
