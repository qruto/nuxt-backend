import { useAuthQuery } from 'better-auth/client'
import type { getPasskeyActions, passkeyClient as eagerPasskeyClient } from '@better-auth/passkey/client'
import { atom } from 'nanostores'

type Ceremony = typeof import('@better-auth/passkey/client')
type PasskeyActions = ReturnType<typeof getPasskeyActions>

/** Better Auth's passkey client plugin, as `passkeyClient()` from `@better-auth/passkey/client` returns it. */
export type PasskeyClientPlugin = ReturnType<typeof eagerPasskeyClient>

/** The ceremony module once it has loaded: an action that finds it calls straight through. */
let ceremony: Ceremony | undefined
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
 * passkey button finds it loaded. The idle plugin calls it after hydration,
 * and `<AuthForm>` and `usePasskeys` on mount. A failure is left for the
 * tap, which loads again and reports it.
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

/**
 * How many passkey prompts (sign-ins without `autoFill`) are open on this
 * page, from the tap until they settle, and whether an autofill sign-in is
 * starting right now: Better Auth's sign-in asks for its challenge first
 * thing, in the call's own task.
 */
let openPrompts = 0
let startingAutofill = false

/**
 * What an autofill sign-in answers when its challenge arrives while a
 * prompt is open: the code SimpleWebAuthn gives a ceremony a newer one
 * replaced, which the autofill path treats as a quiet end.
 */
const SUPERSEDED = {
  data: null,
  error: { code: 'ERROR_CEREMONY_ABORTED', message: 'A passkey prompt took the place of the autofill.', status: 400, statusText: 'BAD_REQUEST' },
}

/** What an action answers when the ceremony cannot load: Better Auth's error envelope, never a throw. */
function unloadable(cause: unknown) {
  return {
    data: null,
    error: {
      code: 'UNKNOWN_ERROR',
      message: cause instanceof Error ? cause.message : 'The passkey prompt could not load.',
      status: 500,
      statusText: 'INTERNAL_SERVER_ERROR',
    },
  }
}

/**
 * Better Auth's passkey client plugin, with the WebAuthn ceremony loaded
 * apart from the page. `createAuthClient` takes its plugins at construction
 * and the base module imports the client on every page, so the plugin
 * itself stays eager: its id, the `listPasskeys` query, the paths it posts
 * to and the signals that refresh the session and the list. What moves out
 * is the ceremony, which `@better-auth/passkey/client` imports statically:
 * {@link preloadPasskeyCeremony} loads it once the page is idle, or when a
 * passkey form mounts.
 *
 * Once it has loaded, a passkey sign-in (conditional UI included) or
 * registration calls Better Auth's own actions (`getPasskeyActions`) with
 * nothing awaited before them, so the options request starts in the tap's
 * own task, exactly as with the eager plugin: WebKit lets the WebAuthn
 * prompt open only while that tap's activation lasts. A tap before the load
 * has landed waits for it first. Requests, WebAuthn options and errors are
 * Better Auth's; a ceremony that cannot load answers `UNKNOWN_ERROR`. One
 * page runs one ceremony at a time, and a prompt outranks an autofill: an
 * autofill whose challenge arrives while a prompt is open answers
 * `ERROR_CEREMONY_ABORTED` without starting its own.
 */
export function passkeyClient(): PasskeyClientPlugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the eager plugin's own signal type
  const $listPasskeys = atom<any>()
  const plugin: Omit<PasskeyClientPlugin, 'version' | '$ERROR_CODES'> = {
    id: 'passkey',
    // Type-level only, as in Better Auth's plugin: the server plugin it pairs with.
    $InferServerPlugin: {} as PasskeyClientPlugin['$InferServerPlugin'],
    getActions($fetch, $store) {
      let actions: PasskeyActions | undefined
      // The challenge request of an autofill sign-in: when its answer comes
      // back while a prompt is open, the prompt wins, and the autofill ends
      // before its ceremony could abort the prompt's. Every other request
      // passes straight through, started in the caller's own task.
      const request = $fetch as unknown as (path: string, options?: object) => Promise<unknown>
      const guarded = ((path: string, options?: object) => {
        // fallow-ignore-next-line security-sink -- the auth client's own $fetch, passed through: Better Auth's passkey actions call it with their literal route paths (`/passkey/...`), resolved against the client's base URL; verified 2026-10-19
        const answer = request(path, options)
        if (!startingAutofill) return answer
        return answer.then(result => (openPrompts === 0 ? result : SUPERSEDED))
      }) as unknown as typeof $fetch
      const actionsOf = (module: Ceremony) => (actions ??= module.getPasskeyActions(guarded, { $listPasskeys, $store }))
      /** One of the ceremony's actions: called straight through once loaded, after the load otherwise. */
      const action = <A extends unknown[], R>(pick: (from: PasskeyActions) => (...args: A) => Promise<R>) =>
        (...args: A): Promise<R | ReturnType<typeof unloadable>> => {
          if (ceremony) return pick(actionsOf(ceremony))(...args)
          return loadPasskeyCeremony().then(module => pick(actionsOf(module))(...args), unloadable)
        }
      type SignInArgs = Parameters<PasskeyActions['signIn']['passkey']>
      /** Better Auth's passkey sign-in, marked while it starts: it asks for its challenge in this call's own task. */
      const startSignIn = (autofill: boolean) => (from: PasskeyActions) => (...args: SignInArgs) => {
        startingAutofill = autofill
        try {
          return from.signIn.passkey(...args)
        }
        finally {
          startingAutofill = false
        }
      }
      return {
        signIn: {
          passkey: (...args: SignInArgs) => {
            const autofill = args[0]?.autoFill === true
            if (autofill) return action(startSignIn(true))(...args)
            // A prompt is open from the tap, before its ceremony has loaded.
            openPrompts++
            return action(startSignIn(false))(...args).finally(() => {
              openPrompts--
            })
          },
        },
        passkey: { addPasskey: action(from => from.passkey.addPasskey) },
        // Type-level only, as in Better Auth's actions.
        $Infer: {} as PasskeyActions['$Infer'],
      }
    },
    getAtoms($fetch) {
      return {
        listPasskeys: useAuthQuery($listPasskeys, '/passkey/list-user-passkeys', $fetch, { method: 'GET' }),
        $listPasskeys,
      }
    },
    pathMethods: {
      '/passkey/register': 'POST',
      '/passkey/authenticate': 'POST',
    },
    atomListeners: [
      {
        matcher: path => path === '/passkey/verify-registration' || path === '/passkey/delete-passkey' || path === '/passkey/update-passkey' || path === '/sign-out',
        signal: '$listPasskeys',
      },
      {
        matcher: path => path === '/passkey/verify-authentication',
        signal: '$sessionSignal',
      },
    ],
  }
  // `version` and `$ERROR_CODES` are type-level for a client plugin: Better
  // Auth's client reads neither at runtime, and both live in the module this
  // one keeps out of the entry. Everything else is checked against the
  // eager plugin's type above.
  return plugin as PasskeyClientPlugin
}
