import { computed, type ComputedRef } from 'vue'
import { activeWorkspaceOf, BUILT_IN, fullWorkspace, memberOf, Refusal, sessionOf, workspaceFields } from './auth-answers.js'
import { activeBackendMock, internalsOf, type BackendMock } from './mock.js'
// Provides the mock on the Nuxt app as soon as the session layer loads.
import './install.js'

// What `backendTestAliases()` puts in place of `#convex/auth-client`, the
// Better Auth client the base module's session layer (`useBetterAuth`, the
// page guard, `useAuth()` on top) is built on. Every method answers
// the way Better Auth's client does (`{ data, error }`, never a throw), from
// the active mock: a stub or a failure on the method's path first, else the
// built-in answer (auth-answers.ts), else `null`.

/** How a thrown answer reads as Better Auth's `error`: a refusal as it is, an `Error` as a server failure, anything else as it is. */
function errorOf(cause: unknown): unknown {
  if (cause instanceof Refusal) return cause.error
  if (cause instanceof Error) return { status: 500, statusText: 'INTERNAL_SERVER_ERROR', message: cause.message }
  return cause
}

/** Methods the session layer calls on its own, which a test does not want in `calls`. */
const UNRECORDED = new Set(['convex.token'])

/** Answer the auth client method at `path` from the active mock, as `{ data, error }`. */
async function answer(path: string, args: unknown[]): Promise<{ data: unknown, error: unknown }> {
  const mock = activeBackendMock()
  const input = args.length > 1 ? args : args[0]
  if (!UNRECORDED.has(path)) mock.calls.push({ kind: 'auth', name: path, args: input })
  const { failures, stubs } = internalsOf(mock)
  if (failures.has(path)) return { data: null, error: failures.get(path) }
  try {
    const stub = stubs.get(path) as ((input: unknown) => unknown) | undefined
    const builtIn = BUILT_IN[path]
    const data = stub ? await stub(input) : builtIn ? builtIn(mock, (input ?? {}) as Record<string, unknown>) : null
    return { data, error: null }
  }
  catch (cause) {
    return { data: null, error: errorOf(cause) }
  }
}

/** A Better Auth read (`useSession()`, `useActiveOrganization()`, …) as its store's value. */
interface AuthRead<T> {
  data: T | null
  isPending: boolean
  isRefetching: boolean
  error: unknown
  refetch: () => Promise<void>
}

const refetch = async () => {}

/**
 * A read of the active mock under the hook name `name`, which
 * `fail(name, error)` fails. While the session loads it is pending with no
 * data, as Better Auth's are; signed out, it has none.
 */
function authRead<T>(name: string, data: (mock: BackendMock) => T | null): ComputedRef<AuthRead<T>> {
  return computed(() => {
    const mock = activeBackendMock()
    const error = internalsOf(mock).failures.get(name) ?? null
    const { isLoading, user } = mock.state
    return { data: error || isLoading || !user ? null : data(mock), isPending: isLoading, isRefetching: false, error, refetch }
  })
}

const sessionRead = authRead('useSession', mock => ({ user: mock.state.user!, session: sessionOf(mock)! }))

/** The hooks the session and workspace composables read through, as computed refs over the active mock. */
const READS: Record<string, () => ComputedRef<AuthRead<unknown>>> = {
  useSession: () => sessionRead,
  useListOrganizations: () => authRead('useListOrganizations', mock => mock.state.workspaces.map(workspaceFields)),
  useActiveOrganization: () => authRead('useActiveOrganization', (mock) => {
    const workspace = activeWorkspaceOf(mock)
    return workspace ? fullWorkspace(mock, workspace) : null
  }),
  useActiveMember: () => authRead('useActiveMember', (mock) => {
    const workspace = activeWorkspaceOf(mock)
    if (!workspace) return null
    const { id, organizationId, userId, role } = memberOf(mock, workspace)
    return { id, organizationId, userId, role }
  }),
}

/** `admin.checkRolePermission` answers synchronously, as the admin plugin's does: an `admin` may do anything. */
function checkRolePermission(args: { role: string, permissions: Record<string, string[]> }): boolean {
  const mock = activeBackendMock()
  mock.calls.push({ kind: 'auth', name: 'admin.checkRolePermission', args })
  const stub = internalsOf(mock).stubs.get('admin.checkRolePermission') as ((input: unknown) => boolean) | undefined
  return stub ? stub(args) : args.role === 'admin'
}

/** One node of the client: callable, and with a child for every property name. */
function clientNode(path: string[]): unknown {
  return new Proxy(() => {}, {
    get: (_target, property) => (typeof property === 'string' && property !== 'then' && !property.startsWith('__v_') ? clientNode([...path, property]) : undefined),
    apply: (_target, _this, args: unknown[]) => {
      const name = path.join('.')
      if (READS[name]) return READS[name]()
      if (name === 'admin.checkRolePermission') return checkRolePermission(args[0] as never)
      return answer(name, args)
    },
  })
}

/** The fake Better Auth client: `authClient.organization.setActive(…)` and every other path. */
export const authClient = clientNode([]) as Record<string, never>
