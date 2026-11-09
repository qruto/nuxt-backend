// The passkey ceremony's loader, and what the sign-in page reads about
// autofill, apart from the passkey client plugin (./passkey-client.ts): the
// idle plugin imports these on every page, the sign-in form and the passkey
// list where they render, while the plugin goes with the auth client, which
// the base module loads on first use. The ceremony is the only Better Auth
// code here, and it is a dynamic import.

type Ceremony = typeof import('@better-auth/passkey/client')

/** The ceremony module once it has loaded: an action that finds it calls straight through. */
let ceremony: Ceremony | undefined

/** The ceremony module, once it has loaded; `undefined` before. */
export function loadedPasskeyCeremony(): Ceremony | undefined {
  return ceremony
}

/** The load in flight, shared by every caller; cleared when it fails, so the next call tries again. */
let loading: Promise<Ceremony> | undefined

/**
 * Load the passkey ceremony — `@better-auth/passkey/client` and the
 * `@simplewebauthn/browser` it imports — once per page. A failed load (a
 * chunk the network dropped) is not kept: the next call loads again.
 */
export function loadPasskeyCeremony(): Promise<Ceremony> {
  if (ceremony) return Promise.resolve(ceremony)
  loading ??= import('@better-auth/passkey/client').then(
    (module) => {
      ceremony = module
      return module
    },
    (cause: unknown) => {
      loading = undefined
      throw cause
    },
  )
  return loading
}

/**
 * Start loading the ceremony where this browser can run one, so a tap on a
 * passkey button finds it loaded. The idle plugin calls it after hydration;
 * a passkey form calls `preparePasskeyPrompt` (./utils/passkey-prompt.ts).
 * A failure is left for the tap, which loads again and reports it.
 */
export function preloadPasskeyCeremony(): void {
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential !== 'function') return
  loadPasskeyCeremony().catch(() => {})
}

/**
 * Whether this browser can offer saved passkeys in a field's autofill
 * (WebAuthn conditional mediation). `false` on the server, in a browser
 * without WebAuthn, and wherever the browser says no.
 */
export async function canAutofillPasskeys(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const credential = window.PublicKeyCredential as { isConditionalMediationAvailable?: () => Promise<boolean> } | undefined
  if (typeof credential?.isConditionalMediationAvailable !== 'function') return false
  try {
    return await credential.isConditionalMediationAvailable()
  }
  catch {
    return false
  }
}

/**
 * The fields a browser offers passkeys on: an `<input>` whose
 * `autocomplete` ends in `webauthn`, the selector Better Auth's ceremony
 * checks for too.
 */
export const AUTOFILL_FIELD = 'input[autocomplete$="webauthn"]'

/**
 * The `autocomplete` of a sign-in field that offers passkeys: the account's
 * name for a password manager, then the `webauthn` token autofill looks for.
 */
export const AUTOFILL_AUTOCOMPLETE = 'username webauthn'

/**
 * How long one autofill offer serves before a fresh one replaces it, in
 * milliseconds: under the five minutes Better Auth's passkey plugin keeps a
 * challenge (its cookie and its verification row), so a passkey picked
 * from a page left open is answered against a challenge the server still
 * holds.
 */
export const AUTOFILL_RENEW_MS = 270_000
