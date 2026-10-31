import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, ref, type Ref } from 'vue'
import { createAuthClient } from 'better-auth/vue'
import { adminClient, emailOTPClient, organizationClient } from 'better-auth/client/plugins'
import { passkeyClient } from '../../src/runtime/vue/passkey-client'
import { authFlow, browserFetch, ORIGIN, wrong } from '../helpers/auth-flow'

// The auth composables over the package's own Better Auth client, talking to
// real Better Auth on a memory database (test/helpers/auth-flow.ts) through
// its routes: a refusal comes back as the client's real `{ data, error }`
// answer, and the composables must turn it into a rejection (the actions) or
// a step that stays put (the step machines). Only the transport is a stand-in:
// the client's fetch calls the handler, with a cookie jar for the session.

type Flow = Awaited<ReturnType<typeof authFlow>>

/** A client with the package's plugins, wired to `flow`'s handler as a browser would be. */
function clientFor(flow: Flow, signedIn: Ref<boolean>) {
  // A Node test has no window, so the client never loads its session atom:
  // read signed-in off the session cookie instead.
  const customFetchImpl = browserFetch(flow.auth, (jar) => {
    signedIn.value = [...jar.keys()].some(name => name.endsWith('session_token'))
  })
  return createAuthClient({
    baseURL: `${ORIGIN}/api/auth`,
    plugins: [emailOTPClient(), passkeyClient(), adminClient(), organizationClient()],
    fetchOptions: { customFetchImpl },
  })
}

const session = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof clientFor>,
  signedIn: null as unknown as Ref<boolean>,
}))

vi.mock('nuxt-convex-module/better-auth/client', () => ({
  useBetterAuth: () => {
    const { client } = session
    const state = client.useSession()
    return {
      client,
      session: state,
      user: computed(() => state.value.data?.user ?? null),
      isAuthenticated: computed(() => session.signedIn.value),
      isLoading: computed(() => false),
      fetchAccessToken: async () => null,
      authVersion: computed(() => state.value.data?.session.id ?? null),
    }
  },
}))
vi.mock('nuxt-convex-module/client', () => ({ useConvex: () => ({ setAuth: vi.fn() }) }))

const { useAuthSession: useAuth } = await import('../../src/runtime/vue/utils/auth-session')
const { useLoginFlow } = await import('../../src/runtime/vue/composables/use-login-flow')
const { useWorkspace } = await import('../../src/runtime/vue/composables/use-workspace')
const { getBackendError } = await import('../../src/runtime/vue/utils/backend-error')

const ADA = 'ada@example.com'
const scope = effectScope()

/** A fresh server and a client signed out against it. */
async function start(): Promise<Flow> {
  const flow = await authFlow()
  session.signedIn = ref(false)
  session.client = clientFor(flow, session.signedIn)
  return flow
}

const inScope = <T>(run: () => T): T => scope.run(run)!

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('useAuth against real Better Auth', () => {
  it('signs in with a code and resolves with the account, then signs out', async () => {
    const flow = await start()
    const auth = inScope(() => useAuth())

    await expect(auth.sendOtp(ADA)).resolves.toBeUndefined()
    const user = await auth.signInWithOtp({ email: ADA, otp: flow.codeFor(ADA)!, name: 'Ada' })
    expect(user).toMatchObject({ email: ADA, name: 'Ada' })
    expect(flow.db.session).toHaveLength(1)

    await expect(auth.signOut()).resolves.toBeUndefined()
    expect(flow.db.session).toHaveLength(0)
    expect(auth.error.value).toBeNull()
  })

  it('rejects a wrong code with what the client answered, and keeps it in error', async () => {
    const flow = await start()
    const auth = inScope(() => useAuth())
    await auth.sendOtp(ADA)

    const rejection = await auth.signInWithOtp({ email: ADA, otp: wrong(flow.codeFor(ADA)) }).catch((cause: unknown) => cause)
    expect(rejection).toBeInstanceOf(Error)
    expect((rejection as Error).cause).toMatchObject({ status: 400, code: 'INVALID_OTP' })
    // Better Auth's INVALID_OTP refuses one input: the code.
    expect(auth.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'otp' } })
    // In the reader's words, not the auth server's English (which stays on the cause).
    expect(auth.error.value?.message).toBe('That code isn\'t right. Check it, or ask for a new one.')
    expect(flow.db.session).toHaveLength(0)
  })

  it('rejects a spent send limit as rate_limited, with the wait', async () => {
    await start()
    const auth = inScope(() => useAuth())
    for (let send = 0; send < 5; send++) await auth.sendOtp(ADA)

    const rejection = await auth.sendOtp(ADA).catch((cause: unknown) => cause)
    expect(getBackendError(rejection)).toMatchObject({ code: 'rate_limited', data: { retryAfter: 60_000 } })
    // The limit's own sentence, which the server wrote for the person.
    expect(auth.error.value).toMatchObject({ code: 'rate_limited', data: { retryAfter: 60_000 }, message: expect.stringMatching(/try again/i) })
  })
})

describe('useLoginFlow against real Better Auth', () => {
  it('walks a code sign-in to its end, never rejecting, past an offer no browser here could take', async () => {
    const flow = await start()
    const onSuccess = vi.fn()
    const login = inScope(() => useLoginFlow({ onSuccess }))
    login.email.value = ADA
    await login.sendCode()
    expect(login.step.value).toBe('verify-code')

    login.otp.value = wrong(flow.codeFor(ADA))
    await expect(login.verifyCode()).resolves.toBeUndefined()
    expect(login.step.value).toBe('verify-code')
    expect(login.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'otp' } })

    login.otp.value = flow.codeFor(ADA)!
    await login.verifyCode()
    expect(login.error.value).toBeNull()
    // No WebAuthn here: the passkey offer is skipped, and the flow is done.
    expect(login.step.value).toBe('verify-code')
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('reads a banned account\'s refusal as forbidden, reason banned', async () => {
    const flow = await start()
    await flow.helpers.saveUser(flow.helpers.createUser({ email: ADA, name: 'Ada', emailVerified: true, banned: true }))
    const login = inScope(() => useLoginFlow())
    login.email.value = ADA
    await login.sendCode()
    login.otp.value = flow.codeFor(ADA)!

    await expect(login.verifyCode()).resolves.toBeUndefined()
    expect(login.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'banned' } })
    expect(login.step.value).toBe('verify-code')
    expect(flow.db.session).toHaveLength(0)
  })
})

describe('useWorkspace against real Better Auth', () => {
  async function signedIn(): Promise<Flow> {
    const flow = await start()
    const auth = inScope(() => useAuth())
    await auth.sendOtp(ADA)
    await auth.signInWithOtp({ email: ADA, otp: flow.codeFor(ADA)!, name: 'Ada' })
    return flow
  }

  it('resolves a new workspace and an invitation with their data', async () => {
    await signedIn()
    const workspace = inScope(() => useWorkspace())

    const created = await workspace.create({ name: 'Acme', slug: 'acme' })
    expect(created).toMatchObject({ name: 'Acme', slug: 'acme' })
    const invitation = await workspace.invite({ email: 'grace@example.com', workspaceId: created.id })
    expect(invitation).toMatchObject({ email: 'grace@example.com', role: 'member', status: 'pending', workspaceId: created.id })
    expect(invitation).not.toHaveProperty('organizationId')
  })

  it('reads an invitation that does not exist as null, and rejects a duplicate slug', async () => {
    await signedIn()
    const workspace = inScope(() => useWorkspace())
    await expect(workspace.getInvitation('no-such-invitation')).resolves.toBeNull()

    await workspace.create({ name: 'Acme', slug: 'acme' })
    await expect(workspace.create({ name: 'Acme again', slug: 'acme' })).rejects.toThrow()
    expect(workspace.error.value).toMatchObject({ code: 'invalid_input', data: { field: 'slug' } })
  })
})
