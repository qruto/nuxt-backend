/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { actionGeneric, componentsGeneric, type FunctionReference, type GenericSchema, type SchemaDefinition } from 'convex/server'
import { v } from 'convex/values'
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

/** The module the test kit adds to the `backend` component: an upload into its storage, as an upload URL leaves one. */
const TEST_KIT_MODULE = './components/backend/testKit.ts'

/** The test kit's own functions inside the component. Never deployed: only `register` mounts them. */
const testKitModule = {
  upload: actionGeneric({
    args: { bytes: v.bytes(), type: v.optional(v.string()) },
    handler: async (ctx, { bytes, type }) => ctx.storage.store(new Blob([bytes], type ? { type } : {})),
  }),
}

/** A component's test helper, as `@convex-dev/<name>/test` exports it. */
export type ComponentTestKit = { register: (t: TestConvex<AnySchema>, name?: string) => unknown }

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
  t.registerComponent(name, schema, { ...modules, [TEST_KIT_MODULE]: () => Promise.resolve(testKitModule) })
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
 * The environment a deployment holds is set when the test file does not
 * set it: `AUTH_SECRET` (signed file URLs, share links and invite codes
 * are keyed with it), `SITE_URL` (`https://app.test`, the origin of a
 * share link) and `CONVEX_SITE_URL` (`https://convex.test`, the origin of
 * a signed file URL and the issuer `asUser` signs with). A test's
 * `vi.stubEnv` wins over them.
 *
 * A component your app mounts a second time under a name of its own (a
 * `workflow` mounted as `generation`, say) goes in `mounts`, with its
 * test helper: `{ generation: workflow }`, `workflow` from
 * `@convex-dev/workflow/test`.
 *
 * Each instance also has `upload` ({@link BackendTestApp}): a file sent
 * into the `backend` component's storage, as an upload URL leaves it.
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
  options: BackendTestAppOptions = {},
): () => BackendTestApp<Schema> {
  // Every `provider/model` id answers with the AI SDK's mock, with no key.
  installTestModels()
  const mounts = Object.entries(options.mounts ?? {})
  for (const [mount, kit] of mounts) {
    if (typeof kit?.register !== 'function') throw new TypeError(`[nuxt-backend] defineBackendTestApp: mounts.${mount} is a component's test helper, the default export of its \`/test\` entry (\`import workflow from '@convex-dev/workflow/test'\`).`)
  }
  return () => {
    setDeploymentEnv()
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
    for (const [mount, kit] of mounts) kit.register(any, mount)
    return Object.assign(t, { upload: (file?: TestFile, fileOptions?: TestUploadOptions) => upload(t, file, fileOptions) })
  }
}

/** The options of {@link defineBackendTestApp}. */
export interface BackendTestAppOptions {
  /**
   * Components your app mounts under a name of its own, beside the ones the
   * scaffold mounts: the mount name from `convex.config.ts`, and the
   * component's test helper (the default export of its `/test` entry).
   */
  mounts?: Record<string, ComponentTestKit>
}

/** A file {@link upload} sends: bytes, a `Blob` (its type kept), or text. */
export type TestFile = Uint8Array | ArrayBuffer | Blob | string

/** How {@link upload} sends a file. */
export interface TestUploadOptions {
  /** The type the browser would send with it. Default: the `Blob`'s own, else none. The package's checks read the type from the bytes anyway. */
  type?: string
}

/** Your app under test, from {@link defineBackendTestApp}: the convex-test instance, and `upload`. */
export type BackendTestApp<Schema extends AnySchema = AnySchema> = TestConvex<Schema> & {
  /**
   * Send a file into the `backend` component's storage, claimed by nobody,
   * as an upload URL leaves it, and return its storage id: what your
   * function then claims (`storage.claim`) or discards. With no file, a
   * valid 2 × 2 PNG ({@link TEST_PNG}).
   */
  upload: (file?: TestFile, options?: TestUploadOptions) => Promise<string>
}

/** The value of each deployment variable a test app reads, when the test file sets none. */
const DEPLOYMENT_ENV = {
  // Long enough for every keyed hash and signature the package makes; a test value, never a deployment's.
  AUTH_SECRET: 'nuxt-backend-test-secret-0123456789abcdef0123456789abcdef',
  SITE_URL: 'https://app.test',
  CONVEX_SITE_URL: 'https://convex.test',
} as const

/** Set each deployment variable the test file left unset. */
function setDeploymentEnv(): void {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  if (!env) return
  for (const [key, value] of Object.entries(DEPLOYMENT_ENV)) env[key] ??= value
}

/** A valid 2 × 2 PNG: what the storage check sniffs, strips and serves. */
export const TEST_PNG: Uint8Array<ArrayBuffer> = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGN4Eq4nKy3GAMRAFgAZigNvRWdDygAAAABJRU5ErkJggg=='), char => char.charCodeAt(0))

/** The test kit's upload, by mount name, through the generic component refs. */
function uploadRef(name: string): FunctionReference<'action', 'internal', { bytes: ArrayBuffer, type?: string }, string> {
  return (componentsGeneric() as unknown as Record<string, { testKit: { upload: FunctionReference<'action', 'internal', { bytes: ArrayBuffer, type?: string }, string> } }>)[name]!.testKit.upload
}

/**
 * Send a file into the `backend` component's storage, claimed by nobody,
 * as the browser leaves it after posting to an upload URL, and return its
 * storage id. With no file, a valid 2 × 2 PNG ({@link TEST_PNG}). An
 * instance from {@link defineBackendTestApp} has it as `t.upload()`.
 *
 * @experimental
 *
 * @param t - A test instance the `backend` component is registered with.
 * @param file - The bytes, a `Blob` or text.
 * @param options - The type the browser would send.
 * @param name - The name the `backend` component is mounted under.
 */
export async function upload<Schema extends AnySchema>(
  t: TestConvex<Schema>,
  file: TestFile = TEST_PNG,
  options: TestUploadOptions = {},
  name: string = 'backend',
): Promise<string> {
  const type = options.type ?? (file instanceof Blob && file.type ? file.type : undefined)
  const bytes = file instanceof Blob
    ? await file.arrayBuffer()
    : typeof file === 'string'
      ? new TextEncoder().encode(file).buffer as ArrayBuffer
      : file instanceof ArrayBuffer ? file : file.slice().buffer as ArrayBuffer
  return t.action(uploadRef(name), { bytes, ...(type ? { type } : {}) })
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

/** Every file stored under test, by the SHA-256 (base64) convex-test names its URL after: what {@link stubStorageFetch} serves. */
const storedFiles = new Map<string, Blob>()

/** A blob's SHA-256 as base64, the way convex-test keys a file's URL. */
async function blobSha(blob: Blob): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
}

/** Store a blob through the runtime, and remember its bytes for the storage URL it gets. */
async function storeBlob(base: Syscalls, blob: Blob): Promise<unknown> {
  const stored = await base.jsSyscall('storage/storeBlob', { blob })
  storedFiles.set(await blobSha(blob), blob)
  return stored
}

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
      const inner = base.jsSyscall
      return (op: string, args: Record<string, unknown>) => op === 'storage/storeBlob' ? storeBlob(base, args.blob as Blob) : inner(op, args)
    },
    get asyncSyscall() {
      const inner = base.asyncSyscall
      return async (op: string, json: string): Promise<string> => {
        if (op === '1.0/storageStore') {
          const { blob, contentType } = JSON.parse(json) as { blob: string, contentType?: string }
          const bytes = Uint8Array.from(atob(blob), char => char.charCodeAt(0))
          return JSON.stringify(await storeBlob(base, new Blob([bytes], contentType ? { type: contentType } : {})))
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

/** Where convex-test's `ctx.storage.getUrl` points: a deployment that does not exist. */
export const TEST_STORAGE_URL = 'https://some-deployment.convex.cloud/api/storage/'

/** How {@link stubStorageFetch} answers. */
export interface StubStorageFetchOptions {
  /**
   * What answers a request that is not for a stored file. Default: none, so
   * the call throws `No network under test` and the step that made it
   * fails, as a test with no network should.
   */
  network?: (request: Request) => Response | Promise<Response>
}

/**
 * Answer `fetch` for the files your functions stored, with their bytes and
 * type, as the deployment's storage would: a model handed a photo by URL,
 * or a signed URL's route reading the file, gets the real file under test.
 * Any other request throws, unless `network` answers it. Returns the
 * function that puts the original `fetch` back: call it after the test.
 *
 * It serves the files stored by an instance of {@link defineBackendTestApp},
 * uploads ({@link upload}) included. A storage URL of no stored file answers
 * 404.
 *
 * @experimental
 *
 * @example
 * ```ts
 * let restoreFetch: () => void
 * beforeEach(() => { restoreFetch = stubStorageFetch() })
 * afterEach(() => restoreFetch())
 * ```
 */
export function stubStorageFetch(options: StubStorageFetchOptions = {}): () => void {
  const original = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    if (request.url.startsWith(TEST_STORAGE_URL)) {
      const file = storedFiles.get(decodeURIComponent(request.url.slice(TEST_STORAGE_URL.length)))
      if (!file) return new Response('Not found', { status: 404 })
      return new Response(file.slice(), { headers: { 'content-type': file.type || 'application/octet-stream', 'content-length': String(file.size) } })
    }
    if (options.network) return options.network(request)
    throw new Error(`[nuxt-backend] No network under test: ${request.method} ${request.url}. Pass stubStorageFetch({ network }) to answer it.`)
  }
  return () => {
    globalThis.fetch = original
  }
}

/** The fake timers {@link drain} steps: Vitest's `vi` after `vi.useFakeTimers()`. */
export interface TestTimers {
  getTimerCount: () => number
  advanceTimersToNextTimer: () => unknown
  isFakeTimers?: () => boolean
}

/**
 * Run every scheduled function to the end, one at a time: storage checks,
 * the job queue and its steps, workflows, deliveries and retries. Between
 * two, the clock moves to the next timer and no further, so a function
 * that stores a file never runs while another commits. Needs fake timers:
 * pass `vi` after `vi.useFakeTimers()`.
 *
 * @experimental
 *
 * @param t - A test instance, e.g. from {@link defineBackendTestApp}.
 * @param timers - Vitest's `vi`, its fake timers on.
 * @param options - How many timers it fires at most before it gives up. Default 5000.
 * @param options.maxSteps - The timers fired at most.
 * @throws Error when the scheduled functions keep scheduling past `maxSteps`.
 *
 * @example
 * ```ts
 * vi.useFakeTimers()
 * await ada.action(api.photos.attach, { fileId: await t.upload() })
 * await drain(t, vi)
 * ```
 */
export async function drain<Schema extends AnySchema>(t: TestConvex<Schema>, timers: TestTimers, options: { maxSteps?: number } = {}): Promise<void> {
  if (timers.isFakeTimers?.() === false) throw new TypeError('[nuxt-backend] drain: turn fake timers on first, with vi.useFakeTimers().')
  const maxSteps = options.maxSteps ?? 5000
  for (let step = 0; step < maxSteps; step++) {
    await t.finishInProgressScheduledFunctions()
    if (timers.getTimerCount() === 0) return
    timers.advanceTimersToNextTimer()
  }
  throw new Error(`[nuxt-backend] drain: the scheduled functions still scheduled more after ${maxSteps} timers. A function that schedules itself forever never drains.`)
}

/** An entity's billing state, as a sync from the provider leaves it, for {@link seedBilling}. */
export interface TestBilling {
  /** The provider's product ids the entity holds. Default none. */
  products?: string[]
  /** The feature keys its benefits grant, as `hasFeature` reads them. Default none. */
  features?: string[]
  /** The balance of each meter, by the provider's meter id. Default none. */
  credits?: Record<string, number>
  /**
   * The provider's customer the entity is: an id, or `true` for a fresh
   * one. Default none, as before a first checkout, so nothing reaches the
   * provider. A customer is what a charge, a refund or the portal calls.
   */
  customer?: string | true
}

/** The billing cache's functions in the component, through the generic component refs. */
type BillingRefs = {
  billing: {
    upsert: FunctionReference<'mutation', 'internal', Record<string, unknown>, null>
    getByUser: FunctionReference<'query', 'internal', { userId: string }, { customerId: string | null, activeProductIds: string[], benefits: Array<Record<string, unknown>>, meters: Array<{ meterId: string, consumedUnits: number, creditedUnits: number, balance: number }> } | null>
  }
}

/** The billing provider component's customer insert, as the app mounts it at `polar`. */
type ProviderRefs = { lib: { insertCustomer: FunctionReference<'mutation', 'internal', { id: string, userId: string }, string> } }

/**
 * Give a billing entity the plans, features and credits a sync from the
 * provider would leave it: the entitlement cache every gate, `hasFeature`,
 * quota and credit spend reads. Replaces what the entity had. No provider is
 * called.
 *
 * The entity is the one billing charges: the workspace by default
 * (`ada.workspaceId`), the account with `billTo: 'user'` (`ada.userId`).
 *
 * @experimental
 *
 * @param t - A test instance, e.g. from {@link defineBackendTestApp}.
 * @param entityId - The billing entity's id.
 * @param billing - Its products, features, meter balances and customer.
 * @param name - The name the `backend` component is mounted under.
 *
 * @example
 * ```ts
 * await seedBilling(t, ada.workspaceId!, { features: ['export'], credits: { [COINS]: 5 } })
 * ```
 */
export async function seedBilling<Schema extends AnySchema>(t: TestConvex<Schema>, entityId: string, billing: TestBilling = {}, name: string = 'backend'): Promise<void> {
  const refs = (componentsGeneric() as unknown as Record<string, BillingRefs>)[name]!
  const customerId = billing.customer === true ? `cus_test_${++created}` : billing.customer
  if (customerId) {
    const provider = (componentsGeneric() as unknown as { polar?: ProviderRefs }).polar
    if (!provider) throw new TypeError('[nuxt-backend] seedBilling: a customer is kept by the billing provider\'s component, mounted at `polar`. Build the instance with defineBackendTestApp.')
    await t.mutation(provider.lib.insertCustomer, { id: customerId, userId: entityId })
  }
  await t.mutation(refs.billing.upsert, {
    userId: entityId,
    ...(customerId ? { customerId } : {}),
    activeProductIds: billing.products ?? [],
    benefits: (billing.features ?? []).map(key => ({ id: `grant-${key}`, benefitId: `benefit-${key}`, type: 'custom', metadata: { key } })),
    meters: Object.entries(billing.credits ?? {}).map(([meterId, balance]) => ({ meterId, consumedUnits: 0, creditedUnits: balance, balance })),
  })
}

/**
 * Set one meter's credit balance for a billing entity, as a sync from the
 * provider leaves it, keeping its plans, features and other meters. No
 * provider is called.
 *
 * @experimental
 *
 * @param t - A test instance, e.g. from {@link defineBackendTestApp}.
 * @param entityId - The billing entity's id (see {@link seedBilling}).
 * @param meterId - The provider's meter id, as your catalog's `meters` hold it.
 * @param balance - The units left.
 * @param name - The name the `backend` component is mounted under.
 */
export async function seedCredits<Schema extends AnySchema>(t: TestConvex<Schema>, entityId: string, meterId: string, balance: number, name: string = 'backend'): Promise<void> {
  const refs = (componentsGeneric() as unknown as Record<string, BillingRefs>)[name]!
  const cached = await t.query(refs.billing.getByUser, { userId: entityId })
  const meters = (cached?.meters ?? []).filter(meter => meter.meterId !== meterId)
  await t.mutation(refs.billing.upsert, {
    userId: entityId,
    ...(cached?.customerId ? { customerId: cached.customerId } : {}),
    activeProductIds: cached?.activeProductIds ?? [],
    benefits: cached?.benefits ?? [],
    meters: [...meters, { meterId, consumedUnits: 0, creditedUnits: balance, balance }],
  })
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
