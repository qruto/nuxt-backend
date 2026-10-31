import { ref, type Ref } from 'vue'
import { tryUseNuxtApp, useCookie, useState } from '#imports'
import { LAST_SIGN_IN_COOKIE } from '../../../convex/constants.js'
import type { SignInMethod } from './auth-session'

// How this browser last signed in, for `useLoginFlow().lastMethod`: the
// cookie Better Auth's lastLoginMethod plugin sets on every sign-in
// (`LAST_SIGN_IN_COOKIE`), read once per page load, by the server render
// when there is one, and handed to the browser with the rest of the page's
// state, so the first client render agrees with the server's. A page the
// server did not render for this request (prerendered, or served from a
// cache) carries the method of the render it came from: none, or another
// visitor's. Once hydrated, the browser reads its own and the state follows.

/** The `useState` key that holds it. */
export const LAST_SIGN_IN_STATE = 'backend:last-sign-in-method'

/** The methods the sign-in UI knows. */
const METHODS: readonly string[] = ['passkey', 'email-otp'] satisfies SignInMethod[]

/** A method the sign-in UI knows, or `null`: anything else a cookie or a record holds is no method of the package's. */
export function signInMethod(value: unknown): SignInMethod | null {
  return typeof value === 'string' && METHODS.includes(value) ? value as SignInMethod : null
}

/**
 * The cookie's value in the browser, or `undefined` without one. Read here
 * rather than with `useCookie`, which opens a channel and listeners per
 * call on the client: the read after hydration runs outside any component
 * that would close them.
 */
function browserCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  for (const pair of document.cookie.split(';')) {
    const at = pair.indexOf('=')
    if (at > 0 && pair.slice(0, at).trim() === LAST_SIGN_IN_COOKIE) {
      try {
        return decodeURIComponent(pair.slice(at + 1).trim())
      }
      catch {
        return undefined
      }
    }
  }
  return undefined
}

/**
 * Per hydrating app: what waits for the browser's own cookie to be read
 * once the page has hydrated ({@link onLastSignInSettled}). An app is in it
 * from its first read during hydration on; its list empties once read.
 */
const settling = new WeakMap<object, Array<() => void>>()

/**
 * The app's one record of how this browser last signed in. The server
 * render reads the request's cookie, the browser `document.cookie`, once;
 * a sign-in through `useAuth` then updates it, as the cookie its answer set
 * would say. Read during hydration, it holds the server's value, then this
 * browser's own cookie once the page has hydrated. Outside a Nuxt app's
 * context (a call after an `await`, a unit test), a plain ref over the
 * cookie.
 */
export function useLastSignInState(): Ref<SignInMethod | null> {
  const nuxtApp = tryUseNuxtApp()
  if (!nuxtApp) return ref(signInMethod(browserCookie()))
  // `import.meta.server`, a build-time constant, keeps `useCookie` (and the
  // cookie parser and watchers it brings) out of the browser's bundle,
  // where it would load with every page.
  const state = useState<SignInMethod | null>(LAST_SIGN_IN_STATE, () => signInMethod(
    import.meta.server ? useCookie(LAST_SIGN_IN_COOKIE, { readonly: true }).value : browserCookie(),
  ))
  if (typeof window !== 'undefined' && nuxtApp.isHydrating && !settling.has(nuxtApp)) {
    settling.set(nuxtApp, [])
    nuxtApp.hooks.hookOnce('app:suspense:resolve', () => {
      const own = signInMethod(browserCookie())
      if (state.value !== own) state.value = own
      const waiting = settling.get(nuxtApp) ?? []
      settling.set(nuxtApp, [])
      for (const settled of waiting) settled()
    })
  }
  return state
}

/**
 * Call `settled` once the browser's own cookie has been read after the page
 * hydrated, when that read is still to come; never otherwise. For a reader
 * that acted on the server's value as it opened: `useLoginFlow`'s opening
 * step.
 */
export function onLastSignInSettled(settled: () => void): void {
  const nuxtApp = tryUseNuxtApp()
  if (nuxtApp?.isHydrating) settling.get(nuxtApp)?.push(settled)
}
