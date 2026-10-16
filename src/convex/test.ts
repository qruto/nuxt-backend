/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { componentsGeneric, type FunctionReference, type GenericSchema, type SchemaDefinition } from 'convex/server'
import aggregate from '@convex-dev/aggregate/test'
import migrations from '@convex-dev/migrations/test'
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/test'
import polar from '@convex-dev/polar/test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import resend from '@convex-dev/resend/test'
import workflow from '@convex-dev/workflow/test'
import { IMPERSONATED_BY_CLAIM } from './constants.js'
import schema from './components/backend/schema.js'

const modules = import.meta.glob('./components/backend/**/*.ts')

type AnySchema = SchemaDefinition<GenericSchema, boolean>

/**
 * Register the nuxt-backend all-in-one `backend` component with a test Convex
 * instance, the way the app mounts it: under its name, with its real schema
 * (indexes and document validation included), and with the email provider
 * child registered beneath it at `<name>/resend` — convex-test resolves a
 * component's own child calls to that path.
 *
 * The component owns its auth schema locally (hybrid component pattern), so
 * there is no upstream `betterAuth` child to register.
 *
 * @param t - The test convex instance, e.g. from calling `convexTest`.
 * @param name - The name the component is mounted under in `convex.config.ts`.
 *
 * @example
 * ```ts
 * import { convexTest } from 'convex-test'
 * import component from 'nuxt-backend/test'
 * import { components } from './_generated/api'
 * import schema from './schema'
 *
 * // `modules` is your functions directory's import.meta.glob
 * const t = convexTest(schema, modules)
 * component.register(t)
 * await t.query(components.backend.billing.getEntitlements, { ... })
 * ```
 */
export function register<Schema extends AnySchema>(
  t: TestConvex<Schema>,
  name: string = 'backend',
): void {
  t.registerComponent(name, schema, modules)
  // The provider's helper is not generic over the app schema (it never reads it).
  resend.register(t as unknown as TestConvex<AnySchema>, `${name}/resend`)
}

/**
 * Your app under test: a fresh convex-test instance per call, with the
 * `backend` component and every component the scaffolded `convex.config.ts`
 * mounts (aggregate, migrations, persistent text streaming, the billing
 * provider, the rate limiter, workflows) registered under the names it
 * mounts them by. Call it once per test, so no test sees another's rows.
 *
 * The aggregate's own batch worker is left out, as `@convex-dev/aggregate/test`
 * leaves it out: a test of async aggregate writes registers it from
 * `@convex-dev/batch-worker/test` at `aggregate/batchWorker`.
 *
 * @experimental
 *
 * @example
 * ```ts [backend/todos.test.ts]
 * import { asUser, defineBackendTestApp } from 'nuxt-backend/test'
 * import { api } from './_generated/api'
 * import schema from './schema'
 *
 * const testApp = defineBackendTestApp(schema, import.meta.glob('./**\/*.ts'))
 *
 * test('a member adds a todo to their workspace', async () => {
 *   const ada = await asUser(testApp(), { workspace: true })
 *   await ada.mutation(api.todos.create, { text: 'Ship it' })
 * })
 * ```
 */
export function defineBackendTestApp<Schema extends AnySchema>(
  appSchema: Schema,
  appModules: Record<string, () => Promise<unknown>>,
): () => TestConvex<Schema> {
  return () => {
    const t = convexTest(appSchema, appModules as Record<string, () => Promise<never>>) as unknown as TestConvex<Schema>
    register(t)
    // Each helper's own generic bound differs; none of them reads the app schema.
    const any = t as unknown as TestConvex<AnySchema>
    aggregate.register(any)
    migrations.register(any)
    persistentTextStreaming.register(any)
    polar.register(any)
    rateLimiter.register(any)
    workflow.register(any)
    return t
  }
}

/** Who {@link asUser} signs in as. Every field is optional. */
export interface TestUserOptions {
  /** The address. Default: a fresh `user-<n>@example.com`. */
  email?: string
  /** Default: the part of the address before the `@`. */
  name?: string
  /** The app-wide role from the admin plugin, such as `'admin'`. Default: `'user'`, the role the plugin gives every new account. */
  role?: string
  /**
   * The active workspace. Default: a personal workspace the user owns, the
   * one every real session activates at sign-in. A workspace id adds them to
   * that one instead (see {@link seedWorkspace}); `false` leaves them in
   * none, as after leaving every workspace.
   */
  workspace?: boolean | string
  /** Their role in that workspace. Default: `'owner'` of their own, `'member'` of another. */
  workspaceRole?: string
  /** The admin's user id, for a session an admin opened by impersonating this user. */
  impersonatedBy?: string
  /**
   * Call as an agent instead of a session: the OAuth client and the scopes
   * it was granted, as the agent token exchange mints them. An agent token
   * belongs to no session.
   */
  agent?: { clientId: string, scopes: string[] }
}

/** Insert a row into the component's auth tables, the way Better Auth's adapter does. */
type Insert = (model: string, data: Record<string, unknown>) => Promise<string>

/** The component's adapter `create`, by mount name, through the generic component refs. */
function inserter<Schema extends AnySchema>(t: TestConvex<Schema>, name: string): Insert {
  const create = (componentsGeneric() as unknown as Record<string, { adapter: { create: FunctionReference<'mutation', 'internal'> } }>)[name]!.adapter.create
  return async (model, data) => (await t.mutation(create, { input: { model, data } } as never) as { _id: string })._id
}

/** A counter for addresses and slugs, unique within a test run. */
let created = 0

/**
 * Create a workspace with no members yet, for several {@link asUser} callers
 * to join: `asUser(t, { workspace: id, workspaceRole: 'admin' })`.
 *
 * @experimental
 *
 * @param t - A test instance, e.g. from {@link defineBackendTestApp}.
 * @param options - What to create.
 * @param options.name - The workspace's name. Default: `Test workspace`.
 * @param name - The name the `backend` component is mounted under.
 * @returns The workspace id.
 */
export async function seedWorkspace<Schema extends AnySchema>(
  t: TestConvex<Schema>,
  options: { name?: string } = {},
  name: string = 'backend',
): Promise<string> {
  return inserter(t, name)('organization', { name: options.name ?? 'Test workspace', slug: `workspace-${++created}`, createdAt: Date.now() })
}

/** The account {@link asUser} created, beside the signed-in caller. */
export interface TestUser {
  userId: string
  email: string
  /** The active workspace; absent with `workspace: false`. */
  workspaceId?: string
  /** The session the identity carries; absent for an agent. */
  sessionId?: string
}

/**
 * The user's active workspace: a personal one they own, made the way a real
 * sign-in makes it, or the one they were asked to join; none with `false`.
 */
async function joinWorkspace(insert: Insert, userId: string, userName: string, options: TestUserOptions): Promise<string | undefined> {
  if (options.workspace === false) return undefined
  const own = typeof options.workspace !== 'string'
  const workspaceId = own
    ? await insert('organization', { name: `${userName}'s workspace`, slug: `personal-${userId.toLowerCase()}`, createdAt: Date.now() })
    : options.workspace as string
  await insert('member', { organizationId: workspaceId, userId, role: options.workspaceRole ?? (own ? 'owner' : 'member'), createdAt: Date.now() })
  return workspaceId
}

/** A session row like Better Auth's, a week from expiry, and its id. */
function openSession(insert: Insert, userId: string, workspaceId: string | undefined, impersonatedBy: string | undefined): Promise<string> {
  const now = Date.now()
  return insert('session', {
    userId,
    token: `test-session-${userId}`,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    ...(workspaceId ? { activeOrganizationId: workspaceId } : {}),
    ...(impersonatedBy ? { impersonatedBy } : {}),
  })
}

/**
 * Create an account in the `backend` component's auth tables and return the
 * instance signed in as it, the way a real sign-in leaves it: the account
 * with the role `'user'`, a personal workspace it owns and has active, and
 * the claims a real token carries. A session's are every account field but
 * the id and image, `activeOrganizationId`, `sessionId` and `impersonatedBy`;
 * an agent's are the account's name, address, role and first workspace,
 * `clientId` and `scopes`. The issuer is `CONVEX_SITE_URL`, as in
 * production, so `tokenIdentifier` matches too. Functions see the caller
 * exactly as they see a signed-in person, so `requireUser`, `requireMember`
 * and the billing entity all resolve.
 *
 * @experimental
 *
 * @param t - A test instance, e.g. from {@link defineBackendTestApp}.
 * @param options - Who to sign in as.
 * @param name - The name the `backend` component is mounted under.
 */
export async function asUser<Schema extends AnySchema>(
  t: TestConvex<Schema>,
  options: TestUserOptions = {},
  name: string = 'backend',
): Promise<ReturnType<TestConvex<Schema>['withIdentity']> & TestUser> {
  const insert = inserter(t, name)
  const email = (options.email ?? `user-${++created}@example.com`).toLowerCase()
  const userName = options.name ?? email.split('@')[0]!
  const now = Date.now()
  // The row Better Auth writes: the admin plugin's role and ban flag included.
  const user = { name: userName, email, emailVerified: true, createdAt: now, updatedAt: now, role: options.role ?? 'user', banned: false }
  const userId = await insert('user', user)
  const workspaceId = await joinWorkspace(insert, userId, userName, options)
  const account = { userId, email, ...(workspaceId ? { workspaceId } : {}) }
  const active = workspaceId ? { activeOrganizationId: workspaceId } : {}
  const signIn = (claims: Record<string, unknown>) =>
    t.withIdentity({ subject: userId, issuer: process.env.CONVEX_SITE_URL ?? 'https://convex.test', ...claims })

  if (options.agent) {
    // The agent token exchange's claims: no session, and the user's first workspace.
    const { clientId, scopes } = options.agent
    return Object.assign(signIn({ name: userName, email, emailVerified: true, role: user.role, ...active, clientId, scopes }), account)
  }
  const sessionId = await openSession(insert, userId, workspaceId, options.impersonatedBy)
  const impersonation = options.impersonatedBy ? { [IMPERSONATED_BY_CLAIM]: options.impersonatedBy } : {}
  return Object.assign(signIn({ ...user, ...active, ...impersonation, sessionId }), account, { sessionId })
}

export default { register, schema, modules }
