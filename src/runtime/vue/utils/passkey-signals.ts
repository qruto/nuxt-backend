// The WebAuthn Signal API and client capabilities: what keeps this
// browser's passkey list in step with the account, and what the browser
// says it can do. Every call is feature-detected and never throws: a
// browser without the API skips the signal and nothing else changes
// (Chrome and Edge 132, Safari 26 have it; checked 2026-10-27).

/** What `PublicKeyCredential.getClientCapabilities()` reports, by the browser's own keys. */
export type PasskeyCapabilities = Record<string, boolean>

interface SignalApi {
  signalUnknownCredential?: (options: { rpId: string, credentialId: string }) => Promise<void>
  signalAllAcceptedCredentials?: (options: { rpId: string, userId: string, allAcceptedCredentialIds: string[] }) => Promise<void>
  signalCurrentUserDetails?: (options: { rpId: string, userId: string, name: string, displayName: string }) => Promise<void>
  getClientCapabilities?: () => Promise<PasskeyCapabilities>
}

function api(): SignalApi | undefined {
  if (typeof window === 'undefined') return undefined
  const credential = window.PublicKeyCredential as unknown
  return typeof credential === 'function' ? credential as SignalApi : undefined
}

/**
 * The relying party the passkeys belong to: the page's host, which is the
 * site URL's, as the server's passkey plugin derives its own.
 */
function rpId(): string {
  return window.location.hostname
}

/**
 * The account's WebAuthn user handle, as the server registers every passkey
 * with it: the account's id, base64url-encoded (`userHandleOf` on the
 * server).
 */
export function userHandle(userId: string): string {
  const bytes = new TextEncoder().encode(userId)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Run a signal, swallowing a browser's refusal: a signal is a hint, never a step that fails. */
async function quietly(signal: (() => Promise<void>) | undefined): Promise<void> {
  if (!signal) return
  try {
    await signal()
  }
  catch {
    // The browser refused the hint (a relying party it does not match, a
    // passkey provider without the feature): nothing changes.
  }
}

/** The server refused a passkey it does not know: the device hides or removes it. */
export function signalUnknownCredential(credentialId: string): Promise<void> {
  const credential = api()
  return quietly(credential?.signalUnknownCredential && (() => credential.signalUnknownCredential!({ rpId: rpId(), credentialId })))
}

/** The passkeys the account still holds: the device keeps only these of the account's. */
export function signalAcceptedCredentials(userId: string, credentialIds: string[]): Promise<void> {
  const credential = api()
  return quietly(credential?.signalAllAcceptedCredentials && (() => credential.signalAllAcceptedCredentials!({ rpId: rpId(), userId: userHandle(userId), allAcceptedCredentialIds: credentialIds })))
}

/** The account's current name and address: the device shows them on its passkeys. */
export function signalUserDetails(user: { id: string, email: string, name?: string | null }): Promise<void> {
  const credential = api()
  return quietly(credential?.signalCurrentUserDetails && (() => credential.signalCurrentUserDetails!({ rpId: rpId(), userId: userHandle(user.id), name: user.email, displayName: user.name || user.email })))
}

/** What the browser reports it can do with passkeys; `null` in a browser that does not say, or off the browser. */
export async function clientCapabilities(): Promise<PasskeyCapabilities | null> {
  const credential = api()
  if (!credential?.getClientCapabilities) return null
  try {
    return await credential.getClientCapabilities()
  }
  catch {
    return null
  }
}

/**
 * Whether this browser can save a passkey: WebAuthn is there, and the
 * capabilities, where the browser reports them, name a passkey provider (on
 * the device, or a phone over the hybrid transport).
 */
export async function canSavePasskey(): Promise<boolean> {
  if (!api()) return false
  const capabilities = await clientCapabilities()
  if (!capabilities) return true
  return capabilities.passkeyPlatformAuthenticator !== false || capabilities.hybridTransport !== false
}

/**
 * The credential id a passkey answer carries: what a refused passkey is
 * signalled by. Read from the body Better Auth's client posts to
 * `/passkey/verify-authentication`.
 */
export function credentialIdOf(body: unknown): string | null {
  let parsed = body
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body)
    }
    catch {
      return null
    }
  }
  const id = (parsed as { response?: { id?: unknown } } | null)?.response?.id
  return typeof id === 'string' && id ? id : null
}
