/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { componentsGeneric, type FunctionReference, type GenericSchema, type SchemaDefinition } from 'convex/server'
import actionCache from '@convex-dev/action-cache/test'
import aggregate from '@convex-dev/aggregate/test'
import batchWorker from '@convex-dev/batch-worker/test'
import migrations from '@convex-dev/migrations/test'
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/test'
import polar from '@convex-dev/polar/test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import resend from '@convex-dev/resend/test'
import shardedCounter from '@convex-dev/sharded-counter/test'
import workflow from '@convex-dev/workflow/test'
import workpool from '@convex-dev/workpool/test'
import { AUTH_TIME_CLAIM, IMPERSONATED_BY_CLAIM, SIGN_IN_METHOD_CLAIM, type SignInMethod } from './constants.js'
import schema from './components/backend/schema.js'
import { installTestModels } from './test-models.js'

const modules = import.meta.glob('./components/backend/**/*.ts')

/** A component's test helper, as `@convex-dev/<name>/test` exports it. */
type ComponentTestKit = { register: (t: TestConvex<AnySchema>, name?: string) => unknown }

/**
 * The Agent and RAG components' test helpers, when the app installs them:
 * chat (`ai.chat`) and knowledge search (`ai.knowledge`) run on them, and
 * an app without either never loads them.
 */
const optionalKits = await Promise.all(['@convex-dev/agent/test', '@convex-dev/rag/test'].map(loadKit))

/** A test helper by its specifier: a variable one, because the kits ship TypeScript source this package's own type check must not compile. */
function loadKit(specifier: string): Promise<ComponentTestKit | null> {
  return import(/* @vite-ignore */ specifier).then(kit => kit.default as ComponentTestKit, () => null)
}

type AnySchema = SchemaDefinition<GenericSchema, boolean>

/**
 * Register the nuxt-backend all-in-one `backend` component with a test Convex
 * instance, the way the app mounts it: under its name, with its real schema
 * (indexes and document validation included), and with its children
 * registered beneath it: the email provider at `<name>/resend`, the
 * package's migrations at `<name>/migrations`, the waitlist's queue
 * and mirror at `<name>/waitlistRank` and `<name>/waitlistMirror`, and the
 * growth funnel's counts at `<name>/funnelCounts` — convex-test
 * resolves a component's own child calls to those paths.
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
  migrations.register(t as unknown as TestConvex<AnySchema>, `${name}/migrations`)
  // The waitlist's queue (an aggregate, with the batch worker its queued writes run on) and its mirror's workpool.
  aggregate.register(t as unknown as TestConvex<AnySchema>, `${name}/waitlistRank`)
  batchWorker.register(t as unknown as TestConvex<AnySchema>, `${name}/waitlistRank/batchWorker`)
  workpool.register(t as unknown as TestConvex<AnySchema>, `${name}/waitlistMirror`)
  // The growth funnel's counts (an aggregate, written in the transaction that records each event).
  aggregate.register(t as unknown as TestConvex<AnySchema>, `${name}/funnelCounts`)
  batchWorker.register(t as unknown as TestConvex<AnySchema>, `${name}/funnelCounts/batchWorker`)
}

/**
 * Your app under test: a fresh convex-test instance per call, with the
 * `backend` component and every component the scaffolded `convex.config.ts`
 * mounts (the action cache, aggregate, migrations, persistent text
 * streaming, the billing provider, the rate limiter, the sharded counter,
 * workflows and the workpool) registered under the names it mounts them by,
 * and the Agent and RAG components (`agent`, `rag`) when the app installs
 * them.
 * Call it once per test, so no test sees another's rows.
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
  // Every `provider/model` id answers with the AI SDK's mock, with no key.
  installTestModels()
  return () => {
    const t = convexTest(appSchema, appModules as Record<string, () => Promise<never>>) as unknown as TestConvex<Schema>
    supportMutationStorage()
    register(t)
    // Each helper's own generic bound differs; none of them reads the app schema.
    const any = t as unknown as TestConvex<AnySchema>
    actionCache.register(any)
    aggregate.register(any)
    migrations.register(any)
    persistentTextStreaming.register(any)
    polar.register(any)
    rateLimiter.register(any)
    shardedCounter.register(any)
    workflow.register(any)
    workpool.register(any)
    for (const kit of optionalKits) kit?.register(any)
    return t
  }
}

type Syscalls = {
  syscall: unknown
  asyncSyscall: (op: string, args: string) => Promise<string>
  jsSyscall: (op: string, args: Record<string, unknown>) => Promise<unknown>
}

/** Bytes as standard base64, the way the runtime passes a file across a syscall. */
const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

let mutationStorage = false

/**
 * `ctx.storage.store` and `ctx.storage.get` in a mutation (Convex 1.48),
 * which convex-test does not serve yet: answered with the same file store
 * its actions use, so a mutation that keeps an upload (`storage.store`)
 * runs under test as it does on a deployment. Installed once, over the
 * global the runtime calls; every other call passes through.
 */
function supportMutationStorage(): void {
  const host = globalThis as unknown as { Convex?: Syscalls }
  const base = host.Convex
  if (mutationStorage || !base) return
  mutationStorage = true
  host.Convex = {
    get syscall() {
      return base.syscall
    },
    get jsSyscall() {
      return base.jsSyscall
    },
    get asyncSyscall() {
      const inner = base.asyncSyscall
      return async (op: string, json: string): Promise<string> => {
        if (op === '1.0/storageStore') {
          const { blob, contentType } = JSON.parse(json) as { blob: string, contentType?: string }
          const bytes = Uint8Array.from(atob(blob), char => char.charCodeAt(0))
          return JSON.stringify(await base.jsSyscall('storage/storeBlob', { blob: new Blob([bytes], contentType ? { type: contentType } : {}) }))
        }
        if (op === '1.0/storageGet') {
          const { storageId } = JSON.parse(json) as { storageId: string }
          const blob = await base.jsSyscall('storage/getBlob', { storageId }) as Blob | null | undefined
          if (!blob) return JSON.stringify(null)
          return JSON.stringify({ blob: toBase64(new Uint8Array(await blob.arrayBuffer())), contentType: blob.type || null })
        }
        return inner(op, json)
      }
    },
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
   * When the session's sign-in happened, as epoch milliseconds (the
   * session's `createdAt` and its token's `authTime` claim). Default:
   * now, a recent sign-in. Set it further back than ten minutes to call as
   * a session a sensitive action refuses (`reauthentication_required`).
   */
  signedInAt?: number
  /**
   * How the session was signed in to: `'email-otp'` (the default, as a
   * first sign-in is), `'passkey'`, or `null` for a session no person
   * signed in to with either. What `ctx.user.signInMethod` reads. An
   * impersonated session has none, whatever this says.
   */
  signInMethod?: SignInMethod | null
  /** Whether the account signs in with passkeys only, refusing sign-in codes. Default `false`. */
  passkeyOnly?: boolean
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
  /** The session the identity carries. */
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

/** A session row like Better Auth's, signed in at `signedInAt` and a week from expiry, and its id. */
function openSession(insert: Insert, userId: string, workspaceId: string | undefined, impersonatedBy: string | undefined, signedInAt: number, signInMethod: SignInMethod | null): Promise<string> {
  const now = Date.now()
  return insert('session', {
    userId,
    token: `test-session-${userId}`,
    createdAt: signedInAt,
    updatedAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    ...(workspaceId ? { activeOrganizationId: workspaceId } : {}),
    ...(impersonatedBy ? { impersonatedBy } : {}),
    ...(signInMethod ? { signInMethod } : {}),
  })
}

/**
 * Create an account in the `backend` component's auth tables and return the
 * instance signed in as it, the way a real sign-in leaves it: the account
 * with the role `'user'`, a personal workspace it owns and has active, and
 * the claims a real token carries. A session's are every account field but
 * the id and image, `activeOrganizationId`, `sessionId`, `authTime`,
 * `signInMethod` and `impersonatedBy`. The issuer is `CONVEX_SITE_URL`, as in
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
  const user = { name: userName, email, emailVerified: true, createdAt: now, updatedAt: now, role: options.role ?? 'user', banned: false, ...(options.passkeyOnly ? { passkeyOnly: true } : {}) }
  const userId = await insert('user', user)
  const workspaceId = await joinWorkspace(insert, userId, userName, options)
  const account = { userId, email, ...(workspaceId ? { workspaceId } : {}) }
  const active = workspaceId ? { activeOrganizationId: workspaceId } : {}
  const signIn = (claims: Record<string, unknown>) =>
    t.withIdentity({ subject: userId, issuer: process.env.CONVEX_SITE_URL ?? 'https://convex.test', ...claims })

  const signedInAt = options.signedInAt ?? now
  const signInMethod = options.impersonatedBy ? null : options.signInMethod === undefined ? 'email-otp' : options.signInMethod
  const sessionId = await openSession(insert, userId, workspaceId, options.impersonatedBy, signedInAt, signInMethod)
  const impersonation = options.impersonatedBy ? { [IMPERSONATED_BY_CLAIM]: options.impersonatedBy } : {}
  const method = signInMethod ? { [SIGN_IN_METHOD_CLAIM]: signInMethod } : {}
  return Object.assign(signIn({ ...user, ...active, ...impersonation, sessionId, [AUTH_TIME_CLAIM]: signedInAt, ...method }), account, { sessionId })
}

export default { register, schema, modules }
