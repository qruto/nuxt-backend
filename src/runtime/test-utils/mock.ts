import { getFunctionName, type FunctionReference } from 'convex/server'
import { reactive, shallowReactive, shallowRef, type ShallowRef } from 'vue'
import type { Passkey } from '../vue/utils/auth-session.js'
import type { ReceivedInvitation, WorkspaceInvitation, WorkspaceMember } from '../vue/composables/use-workspace.js'

// The mock itself: its state, its stubs and the registry the aliased modules
// read it through. Nothing here imports an aliased module, so a Vitest
// config can load this file (through the entry) in plain Node.

/** The signed-in account: Better Auth's user fields, with the admin plugin's `role` and `banned`. */
export interface BackendMockUser {
  /** Default: `'user-1'`. */
  id: string
  /** Default: `'Ada Lovelace'`. */
  name: string
  /** Default: `'ada@example.com'`. */
  email: string
  /** Default: `true`. */
  emailVerified: boolean
  image?: string | null
  /** The app-wide role (`'admin'`, or several comma-separated); `'user'` by default. */
  role: string
  banned?: boolean
  /** How the account last signed in (`'passkey'`, `'email-otp'`); the built-in sign-in answers set it. */
  lastLoginMethod?: string | null
  [field: string]: unknown
}

/** A workspace the account belongs to, with its role there and, optionally, who else is in it. */
export interface BackendMockWorkspace {
  id: string
  name: string
  slug: string
  logo?: string | null
  createdAt: number
  /** The signed-in account's role here. Default: `'owner'`. */
  role: string
  /** Everyone in it. Default: the signed-in account alone, with `role`. */
  members?: WorkspaceMember[]
  /** The invitations it has sent. Default: none. */
  invitations?: WorkspaceInvitation[]
}

/** An invitation sent to the account, with what the invitation page shows about it. */
export interface BackendMockInvitation extends ReceivedInvitation {
  /** Default: the workspace's name when the account knows it, else its id. */
  workspaceName?: string
  /** Default: the workspace's slug when the account knows it, else its id. */
  workspaceSlug?: string
  /** Default: `'inviter@example.com'`. */
  inviterEmail?: string
}

/**
 * Everything the mock answers from. Reactive: change a field and every
 * composable reading it follows, as it would follow the live backend.
 */
export interface BackendMockState {
  /** The signed-in account, or `null` while signed out. */
  user: BackendMockUser | null
  /** Session fields beyond the ones the mock derives (`userId`, `activeOrganizationId`); `id` defaults to `session-<user id>`. */
  session: { id?: string, impersonatedBy?: string | null, [field: string]: unknown }
  /** `true` while the session is still being read: the session reads as pending, with no account yet. */
  isLoading: boolean
  /** The account's workspaces. */
  workspaces: BackendMockWorkspace[]
  /** The id of the active workspace, or `null` for none. */
  activeWorkspace: string | null
  /** Invitations sent to the account, which it can accept or decline. */
  invitations: BackendMockInvitation[]
  /** The account's passkeys. */
  passkeys: Passkey[]
  /**
   * Query results by function name (`'billing:getCredits'`): a value, or a
   * function of the query's arguments. A query with no entry, or whose
   * function returns `undefined`, is still loading.
   */
  queries: Record<string, unknown>
}

/** What {@link createBackendMock} starts from: every field optional, the account partial. */
export interface BackendMockInit {
  /** Signed in as this account, its missing fields filled in; `null` or left out: signed out. */
  user?: Partial<BackendMockUser> | null
  session?: BackendMockState['session']
  isLoading?: boolean
  /** Default: one personal workspace the account owns. */
  workspaces?: Array<Partial<BackendMockWorkspace> & { id: string }>
  /** Default: the first workspace. */
  activeWorkspace?: string | null
  invitations?: BackendMockInvitation[]
  passkeys?: Passkey[]
  queries?: Record<string, unknown>
}

/** One call the mock answered: a backend function by its name, or an auth client method by its path. */
export interface BackendMockCall {
  kind: 'query' | 'mutation' | 'action' | 'auth'
  /** `'billing:generateCheckoutLink'` for a function, `'organization.setActive'` for an auth client method. */
  name: string
  args: unknown
}

/**
 * A backend function by name (`'billing:getCredits'`) or reference
 * (`api.billing.getCredits`), or an auth client method by its path
 * (`'organization.setActive'`, `'signIn.emailOtp'`).
 */
export type BackendMockName = string | FunctionReference<'query' | 'mutation' | 'action', 'public' | 'internal'>

/** The fake backend {@link createBackendMock} returns. */
export interface BackendMock {
  /** The reactive state every read answers from. */
  readonly state: BackendMockState
  /** Every mutation, action, one-off query and auth client call, in order. */
  readonly calls: BackendMockCall[]
  /** The arguments of each call to `name`, in order. */
  callsTo: (name: BackendMockName) => unknown[]
  /**
   * Answer `name` with `answer(args)` from now on: a query's result, a
   * mutation's or action's return value, an auth client method's `data`.
   * A throw (or a rejection) fails the call. Clears a `fail` on the name.
   */
  stub: (name: BackendMockName, answer: (args: never) => unknown) => BackendMock
  /**
   * Fail `name` with `error` from now on: a query reads it as its error, a
   * mutation or action rejects with it, and an auth client method answers
   * `{ data: null, error }` the way Better Auth's client does. An auth read
   * fails by its hook's name (`'useActiveOrganization'`; `'useSession'`
   * reads as signed out).
   */
  fail: (name: BackendMockName, error: unknown) => BackendMock
  /** Sign in, as the account the mock started with or a default one, with `fields` over it. */
  signIn: (fields?: Partial<BackendMockUser>) => BackendMockUser
  /** Sign out. */
  signOut: () => void
}

/** The account a sign-in falls back to. */
const DEFAULT_USER: BackendMockUser = { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: true, role: 'user' }

/** The workspace sign-up makes, as `asUser` in `nuxt-backend/test` makes it. */
const PERSONAL_WORKSPACE: Partial<BackendMockWorkspace> & { id: string } = { id: 'workspace-1', name: 'Personal', slug: 'personal' }

type Answer = (args: never) => unknown

/** What a mock keeps beside its public face. */
interface Internals {
  stubs: Map<string, Answer>
  failures: Map<string, unknown>
  lastUser: Partial<BackendMockUser>
  /** The names an unstubbed call was already warned about. */
  warned: Set<string>
  /** Ids the mock hands out, counted per mock so every test sees the same ones. */
  created: number
}

const internals = new WeakMap<BackendMock, Internals>()

interface Registry {
  active: ShallowRef<BackendMock | undefined>
  fallback: BackendMock | undefined
  /** Run when a mock becomes the active one: the aliased modules put it on the Nuxt app. */
  activated: Set<(mock: BackendMock) => void>
  /** Run on a reset: the aliased modules drop what they cached (the session token). */
  reset: Set<() => void>
  /** What the aliased modules provide, under the base module's keys; set once they load. */
  provides?: () => Record<symbol, unknown>
}

/** The mock every aliased module reads. One per test file: Vitest loads each file's modules afresh. */
export const registry: Registry = {
  active: shallowRef<BackendMock>(),
  fallback: undefined,
  activated: new Set(),
  reset: new Set(),
}

/** A function or method name as the mock keys it. */
export function nameOf(name: BackendMockName): string {
  return typeof name === 'string' ? name : getFunctionName(name)
}

/** The full workspace a partial one describes. */
function workspaceOf(input: Partial<BackendMockWorkspace> & { id: string }): BackendMockWorkspace {
  return { name: input.id, slug: input.id, createdAt: 0, role: 'owner', ...input }
}

function buildMock(init: BackendMockInit): BackendMock {
  const workspaces = (init.workspaces ?? [PERSONAL_WORKSPACE]).map(workspaceOf)
  const state = reactive<BackendMockState>({
    user: init.user ? { ...DEFAULT_USER, ...init.user } : null,
    session: { ...init.session },
    isLoading: init.isLoading ?? false,
    workspaces,
    activeWorkspace: init.activeWorkspace !== undefined ? init.activeWorkspace : workspaces[0]?.id ?? null,
    invitations: init.invitations ?? [],
    passkeys: init.passkeys ?? [],
    // Shallow: a query hands back the very value the test gave it.
    queries: shallowReactive({ ...init.queries }),
  }) as BackendMockState
  const own: Internals = { stubs: shallowReactive(new Map()), failures: shallowReactive(new Map()), lastUser: { ...init.user }, warned: new Set(), created: 0 }
  const mock: BackendMock = {
    state,
    calls: [],
    callsTo: name => mock.calls.filter(call => call.name === nameOf(name)).map(call => call.args),
    stub: (name, answer) => {
      own.failures.delete(nameOf(name))
      own.stubs.set(nameOf(name), answer)
      return mock
    },
    fail: (name, error) => {
      own.failures.set(nameOf(name), error)
      return mock
    },
    signIn: (fields = {}) => {
      own.lastUser = { ...own.lastUser, ...fields }
      state.user = { ...DEFAULT_USER, ...own.lastUser }
      return state.user
    },
    signOut: () => {
      state.user = null
    },
  }
  internals.set(mock, own)
  return mock
}

/**
 * A fake backend for an app's component and page tests: the package's
 * composables and components, and the base module's own (`useQuery`,
 * `<Authenticated>`, the page guard, …), read it instead of a
 * deployment once {@link backendTestAliases} is in the Vitest project.
 * Queries answer from `state.queries`; mutations, actions and auth client
 * calls are recorded in `calls` and answer what `stub` says (or a built-in
 * answer for the auth flows: signing in, switching workspace, …); `fail`
 * makes any of them fail. The state is reactive: change it in a test and
 * the rendered page follows.
 *
 * The newest mock is the one everything reads, so make one per test, in a
 * `beforeEach` or the test itself. Signed out unless `user` is given.
 *
 * @param init - The starting state: the account, its workspaces, query results.
 *
 * @example
 * ```ts
 * import { createBackendMock } from 'nuxt-backend/test-utils'
 * import { mountSuspended } from '@nuxt/test-utils/runtime'
 * import { flushPromises } from '@vue/test-utils'
 * import { expect, test } from 'vitest'
 * import CreditsPage from '~/pages/credits.vue'
 *
 * test('the balance follows the backend', async () => {
 *   const backend = createBackendMock({
 *     user: { name: 'Ada' },
 *     queries: { 'billing:getCredits': { meters: [{ meterId: 'm1', name: 'credits', balance: 42 }] } },
 *   })
 *   const page = await mountSuspended(CreditsPage)
 *   expect(page.text()).toContain('42')
 *
 *   backend.state.queries['billing:getCredits'] = { meters: [{ meterId: 'm1', name: 'credits', balance: 0 }] }
 *   await flushPromises()
 *   expect(page.text()).toContain('0')
 * })
 * ```
 */
export function createBackendMock(init: BackendMockInit = {}): BackendMock {
  const mock = buildMock(init)
  registry.active.value = mock
  for (const hook of registry.reset) hook()
  for (const hook of registry.activated) hook(mock)
  return mock
}

/**
 * Forget every mock: the active one, the signed-out fallback and the
 * session token the auth layer cached. The next read answers from a fresh
 * signed-out mock until a test makes its own.
 */
export function resetBackendMock(): void {
  registry.active.value = undefined
  registry.fallback = undefined
  for (const hook of registry.reset) hook()
}

/**
 * The mock's client and auth state under the base module's keys and its
 * function tree under this package's, for a plain `mount()`: `mountSuspended` copies them from the
 * Nuxt app, where each new mock is provided, but `mount()` starts an app of
 * its own. Pass them as `global.provide`. Throws when the aliases are not in
 * the Vitest project.
 *
 * @example
 * ```ts
 * import { mount } from '@vue/test-utils'
 * import { backendMockProvides, createBackendMock } from 'nuxt-backend/test-utils'
 *
 * createBackendMock({ user: { name: 'Ada' } })
 * const page = mount(Dashboard, { global: { provide: backendMockProvides() } })
 * ```
 */
export function backendMockProvides(): Record<symbol, unknown> {
  if (!registry.provides) {
    throw new Error('[nuxt-backend/test-utils] backendMockProvides() needs backendTestAliases() in the Vitest project, and a test that imports a component or composable of the package or the base module.')
  }
  return registry.provides()
}

/** The mock the aliased modules read: the newest one, or a signed-out one before any test made its own. */
export function activeBackendMock(): BackendMock {
  return registry.active.value ?? (registry.fallback ??= buildMock({}))
}

/** The stubs, failures and fallback account behind a mock. */
export function internalsOf(mock: BackendMock): Internals {
  return internals.get(mock)!
}

/** A fresh id for something the active mock creates: `workspace-2`, `passkey-1`, … */
export function freshId(mock: BackendMock, kind: string): string {
  return `${kind}-mock-${++internalsOf(mock).created}`
}

/** The state of a query read, as the base module's `useQuery_experimental` reports it. */
export type QueryRead
  = | { status: 'pending' }
    | { status: 'success', data: unknown }
    | { status: 'error', error: unknown }

/** Read the query `name` with `args` from the active mock. Reactive: call it inside a `computed`. */
export function readQuery(name: string, args: unknown): QueryRead {
  const mock = activeBackendMock()
  const { failures, stubs } = internalsOf(mock)
  if (failures.has(name)) return { status: 'error', error: failures.get(name) }
  const entry = stubs.get(name) ?? mock.state.queries[name]
  try {
    const data = typeof entry === 'function' ? (entry as (args: unknown) => unknown)(args) : entry
    return data === undefined ? { status: 'pending' } : { status: 'success', data }
  }
  catch (error) {
    return { status: 'error', error }
  }
}

/**
 * Run a mutation, an action or a one-off query against the active mock:
 * recorded, then stubbed or failed. A mutation or action nobody stubbed
 * resolves `undefined` and warns once per name, since a test that relies on
 * its answer has to stub it.
 */
export async function callFunction(kind: 'query' | 'mutation' | 'action', name: string, args: unknown): Promise<unknown> {
  const mock = activeBackendMock()
  mock.calls.push({ kind, name, args })
  const own = internalsOf(mock)
  if (own.failures.has(name)) throw own.failures.get(name)
  const stub = own.stubs.get(name)
  if (stub) return await (stub as (args: unknown) => unknown)(args)
  if (kind === 'query') {
    const read = readQuery(name, args)
    if (read.status === 'error') throw read.error
    return read.status === 'success' ? read.data : undefined
  }
  if (!own.warned.has(name)) {
    own.warned.add(name)
    console.warn(`[nuxt-backend/test-utils] no stub for the ${kind} ${name}: it resolved undefined. Answer it with backend.stub('${name}', args => …).`)
  }
  return undefined
}
