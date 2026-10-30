import { afterEach, describe, expect, it, vi } from 'vitest'
import { userHandleOf } from '../../src/convex/client/passkey-only'
import { canSavePasskey, clientCapabilities, credentialIdOf, signalAcceptedCredentials, signalUserDetails, userHandle } from '../../src/runtime/vue/utils/passkey-signals'

// The WebAuthn Signal API and client capabilities from the browser's side:
// the user handle matches the one the server registers passkeys with, and
// every call is a hint that never throws.

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A browser with WebAuthn and the given statics on PublicKeyCredential. */
function browser(statics: Record<string, unknown> = {}) {
  vi.stubGlobal('window', { PublicKeyCredential: Object.assign(function PublicKeyCredential() {}, statics), location: { hostname: 'app.example.com' } })
}

describe('the passkey signals', () => {
  it('name the account by the handle the server registers its passkeys with', () => {
    for (const id of ['k57abc123', 'user_01JX', 'ünïcode']) expect(userHandle(id)).toBe(userHandleOf(id))
  })

  it('send the account\'s passkeys and details for the page\'s relying party', async () => {
    const signalAllAcceptedCredentials = vi.fn(async () => {})
    const signalCurrentUserDetails = vi.fn(async () => {})
    browser({ signalAllAcceptedCredentials, signalCurrentUserDetails })
    await signalAcceptedCredentials('u1', ['cred-a'])
    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith({ rpId: 'app.example.com', userId: userHandleOf('u1'), allAcceptedCredentialIds: ['cred-a'] })
    await signalUserDetails({ id: 'u1', email: 'ada@example.com', name: 'Ada' })
    expect(signalCurrentUserDetails).toHaveBeenCalledWith({ rpId: 'app.example.com', userId: userHandleOf('u1'), name: 'ada@example.com', displayName: 'Ada' })
  })

  it('skip a browser without them, and swallow a browser\'s refusal', async () => {
    await expect(signalAcceptedCredentials('u1', [])).resolves.toBeUndefined()
    browser({ signalAllAcceptedCredentials: () => Promise.reject(new DOMException('no', 'SecurityError')) })
    await expect(signalAcceptedCredentials('u1', [])).resolves.toBeUndefined()
  })
})

describe('the capabilities', () => {
  it('are null off the browser and where the browser does not say', async () => {
    expect(await clientCapabilities()).toBeNull()
    expect(await canSavePasskey()).toBe(false)
    browser()
    expect(await clientCapabilities()).toBeNull()
    expect(await canSavePasskey()).toBe(true)
  })

  it('rule out saving a passkey only when the browser names no provider at all', async () => {
    browser({ getClientCapabilities: async () => ({ passkeyPlatformAuthenticator: false, hybridTransport: true }) })
    expect(await canSavePasskey()).toBe(true)
    browser({ getClientCapabilities: async () => ({ passkeyPlatformAuthenticator: false, hybridTransport: false }) })
    expect(await canSavePasskey()).toBe(false)
  })
})

describe('the refused passkey', () => {
  it('is read from the answer\'s body, string or object', () => {
    expect(credentialIdOf(JSON.stringify({ response: { id: 'cred-1' } }))).toBe('cred-1')
    expect(credentialIdOf({ response: { id: 'cred-2' } })).toBe('cred-2')
    expect(credentialIdOf('not json')).toBeNull()
    expect(credentialIdOf(undefined)).toBeNull()
  })
})
