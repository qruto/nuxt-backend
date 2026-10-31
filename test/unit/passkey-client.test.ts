import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthClient } from 'better-auth/vue'
import { emailOTPClient } from 'better-auth/client/plugins'
import { passkey } from '@better-auth/passkey'
import { authFlow, browserFetch, ORIGIN } from '../helpers/auth-flow'

// The package's passkey client plugin (src/runtime/vue/passkey-client.ts)
// against real Better Auth on a memory database. The plugin is registered
// with the client, which every page loads; the ceremony —
// `@better-auth/passkey/client` and the `@simplewebauthn/browser` it imports
// statically — loads apart from the page, and once loaded must run exactly
// as Better Auth's own plugin does, its options request in the tap's own
// task. Node has no WebAuthn, so every ceremony here ends the way a
// cancelled prompt does. Each test starts from a fresh copy of the plugin's
// module, with the ceremony not yet loaded.

/** How often the ceremony module was evaluated in this test, and whether the next load fails as a dropped chunk does. */
const ceremony = { loads: 0, failNext: false }

type Lazy = typeof import('../../src/runtime/vue/passkey-client')
let lazy: Lazy

beforeEach(async () => {
  vi.unstubAllEnvs()
  vi.resetModules()
  ceremony.loads = 0
  ceremony.failNext = false
  vi.doMock('@better-auth/passkey/client', async (importOriginal) => {
    ceremony.loads++
    if (ceremony.failNext) {
      ceremony.failNext = false
      throw new Error('Failed to fetch dynamically imported module')
    }
    return importOriginal()
  })
  lazy = await import('../../src/runtime/vue/passkey-client')
})

const ADA = 'ada@example.com'

/** A fresh server, and a client with the package's passkey plugin that records the paths it asks for. */
async function start() {
  const flow = await authFlow()
  const transport = browserFetch(flow.auth)
  const paths: string[] = []
  const customFetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    paths.push(new URL(input instanceof Request ? input.url : input).pathname.replace('/api/auth', ''))
    return transport(input, init)
  }
  const client = createAuthClient({
    baseURL: `${ORIGIN}/api/auth`,
    plugins: [emailOTPClient(), lazy.passkeyClient()],
    fetchOptions: { customFetchImpl },
  })
  return { flow, client, paths }
}

/** What a cancelled or impossible ceremony answers: Better Auth's own error, never a throw. */
const CANCELLED = { data: null, error: { code: 'AUTH_CANCELLED', status: 400, statusText: 'BAD_REQUEST' } }

/** A `$fetch` and a store for calling a plugin's actions by hand: every request answers a refusal. */
function bare() {
  const $fetch = vi.fn(async () => ({ data: null, error: { status: 401, statusText: 'UNAUTHORIZED' } }))
  const $store = { notify: vi.fn(), listen: vi.fn(), atoms: {} }
  return { $fetch, $store }
}

describe('the passkey client plugin', () => {
  it('registers with the client without loading the ceremony', async () => {
    const { client } = await start()
    expect(typeof client.signIn.passkey).toBe('function')
    expect(typeof client.passkey.addPasskey).toBe('function')
    // The list query is the client's from construction.
    expect(typeof client.useListPasskeys).toBe('function')
    expect(ceremony.loads).toBe(0)
  })

  it('loads the ceremony on a tap that comes before the preload, then asks the server for its options', async () => {
    const { client, paths } = await start()
    const answer = await client.signIn.passkey()
    expect(ceremony.loads).toBe(1)
    expect(paths).toEqual(['/passkey/generate-authenticate-options'])
    expect(answer).toMatchObject(CANCELLED)
  })

  it('loads the ceremony once for a sign-in, conditional UI and a registration', async () => {
    const { flow, client, paths } = await start()
    await client.emailOtp.sendVerificationOtp({ email: ADA, type: 'sign-in' })
    await client.signIn.emailOtp({ email: ADA, otp: flow.codeFor(ADA)! })

    expect(await client.signIn.passkey()).toMatchObject(CANCELLED)
    expect(await client.signIn.passkey({ autoFill: true })).toMatchObject(CANCELLED)
    const registration = await client.passkey.addPasskey({ name: 'Laptop' })
    expect(registration.data).toBeNull()
    expect(registration.error).toMatchObject({ status: 500, code: 'UNKNOWN_ERROR' })
    expect(paths.slice(-3)).toEqual(['/passkey/generate-authenticate-options', '/passkey/generate-authenticate-options', '/passkey/generate-register-options'])
    expect(ceremony.loads).toBe(1)
  })

  it('once loaded, starts the options request in the tap\'s own task, with nothing awaited before it', async () => {
    await lazy.loadPasskeyCeremony()
    const { $fetch, $store } = bare()
    const actions = lazy.passkeyClient().getActions($fetch as never, $store as never)

    const signIn = actions.signIn.passkey()
    expect($fetch).toHaveBeenCalledTimes(1)
    expect($fetch).toHaveBeenLastCalledWith('/passkey/generate-authenticate-options', expect.objectContaining({ method: 'GET' }))
    const registration = actions.passkey.addPasskey()
    expect($fetch).toHaveBeenCalledTimes(2)
    expect($fetch).toHaveBeenLastCalledWith('/passkey/generate-register-options', expect.objectContaining({ method: 'GET' }))
    // The server's refusal comes back as it is, as from Better Auth's plugin.
    expect(await signIn).toMatchObject({ data: null, error: { status: 401 } })
    expect(await registration).toMatchObject({ data: null, error: { status: 401 } })
  })

  // One ceremony runs at a time, and a newer one aborts the older: an
  // autofill whose challenge arrives while a prompt is open would end the
  // prompt the person just opened. It gives way instead, before its own
  // ceremony starts.
  it('lets a prompt opened while an autofill waits for its challenge win', async () => {
    await lazy.loadPasskeyCeremony()
    const answers: Array<(answer: unknown) => void> = []
    const $fetch = vi.fn(() => new Promise((resolve) => {
      answers.push(resolve)
    }))
    const { $store } = bare()
    const actions = lazy.passkeyClient().getActions($fetch as never, $store as never)
    const challenge = { data: { challenge: 'Y2hhbGxlbmdl', allowCredentials: [] }, error: null }

    const autofill = actions.signIn.passkey({ autoFill: true })
    const prompt = actions.signIn.passkey()
    expect($fetch).toHaveBeenCalledTimes(2)
    answers[0]!(challenge)
    expect(await autofill).toMatchObject({ data: null, error: { code: 'ERROR_CEREMONY_ABORTED' } })
    answers[1]!({ data: null, error: { status: 401, statusText: 'UNAUTHORIZED' } })
    expect(await prompt).toMatchObject({ data: null, error: { status: 401 } })

    // With no prompt open, an autofill runs its own ceremony (which, with
    // no WebAuthn in Node, ends the way a cancelled one does).
    const later = actions.signIn.passkey({ autoFill: true })
    answers[2]!(challenge)
    expect(await later).toMatchObject(CANCELLED)
  })

  it('before the load lands, asks for the options only once it has', async () => {
    const { $fetch, $store } = bare()
    const signIn = lazy.passkeyClient().getActions($fetch as never, $store as never).signIn.passkey()
    expect($fetch).not.toHaveBeenCalled()
    await signIn
    expect($fetch).toHaveBeenCalledWith('/passkey/generate-authenticate-options', expect.anything())
  })

  it('preloads only where the browser can run a ceremony', async () => {
    lazy.preloadPasskeyCeremony()
    expect(ceremony.loads).toBe(0)
    vi.stubGlobal('window', { PublicKeyCredential: function PublicKeyCredential() {} })
    try {
      lazy.preloadPasskeyCeremony()
      await vi.waitFor(() => expect(ceremony.loads).toBe(1))
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('answers a ceremony that cannot load with Better Auth\'s error, and loads it again on the next tap', async () => {
    const { client, paths } = await start()
    ceremony.failNext = true
    expect(await client.signIn.passkey()).toEqual({
      data: null,
      // The import's own message (the test runner wraps it in one of its own).
      error: { code: 'UNKNOWN_ERROR', message: expect.any(String), status: 500, statusText: 'INTERNAL_SERVER_ERROR' },
    })
    expect(paths).toEqual([])
    // The failure is not kept: the next tap loads it, and the ceremony runs.
    expect(await client.signIn.passkey()).toMatchObject(CANCELLED)
    expect(ceremony.loads).toBe(2)
  })

  it('carries the eager plugin\'s surface: fields, actions, atoms and the signals for every passkey route', async () => {
    const eager = (await import('@better-auth/passkey/client')).passkeyClient()
    const ours = lazy.passkeyClient()
    const { $fetch, $store } = bare()
    const fields = (plugin: object) => Object.keys(plugin).filter(key => key !== 'version' && key !== '$ERROR_CODES').sort()
    const leaves = (value: object, prefix = ''): string[] => Object.entries(value).flatMap(([key, entry]) =>
      entry && typeof entry === 'object' && Object.keys(entry).length > 0 ? leaves(entry, `${prefix}${key}.`) : [`${prefix}${key}`]).sort()
    expect(fields(ours)).toEqual(fields(eager))
    expect(leaves(ours.getActions($fetch as never, $store as never))).toEqual(leaves(eager.getActions($fetch as never, $store as never)))
    expect(Object.keys(ours.getAtoms($fetch as never)).sort()).toEqual(Object.keys(eager.getAtoms($fetch as never)).sort())
    expect(ours.pathMethods).toEqual(eager.pathMethods)
    const paths = [...Object.values(passkey().endpoints).map(endpoint => endpoint.path), '/sign-out', '/sign-in/email-otp', '/get-session', '/update-user', '/revoke-sessions']
    const signals = (plugin: typeof eager) => paths.map(path => [path, plugin.atomListeners?.filter(listener => listener.matcher(path)).map(listener => listener.signal)])
    expect(signals(ours)).toEqual(signals(eager))
  })
})
