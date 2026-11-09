import { useAuthQuery } from 'better-auth/client'
import type { getPasskeyActions, passkeyClient as eagerPasskeyClient } from '@better-auth/passkey/client'
import { atom } from 'nanostores'
import { loadedPasskeyCeremony, loadPasskeyCeremony } from './passkey-ceremony'

type Ceremony = typeof import('@better-auth/passkey/client')
type PasskeyActions = ReturnType<typeof getPasskeyActions>

/** Better Auth's passkey client plugin, as `passkeyClient()` from `@better-auth/passkey/client` returns it. */
export type PasskeyClientPlugin = ReturnType<typeof eagerPasskeyClient>

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
 * apart from the client. `createAuthClient` takes its plugins at
 * construction, so the plugin loads with the client (which the base module
 * loads on first use, not with every page): its id, the `listPasskeys`
 * query, the paths it posts to and the signals that refresh the session and
 * the list. What moves out is the ceremony, which
 * `@better-auth/passkey/client` imports statically: `preloadPasskeyCeremony`
 * (./passkey-ceremony.ts) loads it once the page is idle, and
 * `preparePasskeyPrompt` (./utils/passkey-prompt.ts) when a passkey form
 * mounts, the client with it.
 *
 * Once it has loaded, a passkey sign-in (conditional UI included) or
 * registration calls Better Auth's own actions (`getPasskeyActions`) with
 * nothing awaited before them, so the options request starts in the tap's
 * own task, exactly as with the eager plugin: WebKit lets the WebAuthn
 * prompt open only while that tap's activation lasts. A tap before either
 * load has landed waits for it first. Requests, WebAuthn options and errors are
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
          const ceremony = loadedPasskeyCeremony()
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
