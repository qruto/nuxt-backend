import { ref, type Ref } from 'vue'
import { tryUseNuxtApp, useCookie, useState } from '#imports'
import { LAST_SIGN_IN_COOKIE } from '../../../convex/constants.js'
import { parseStorage, STORAGE_COOKIE, STORAGE_COOKIE_MAX_AGE, storageFromCookieHeader, type StoragePurpose } from '../../../convex/consent-rules.js'
import type { SignInMethod } from './auth-session'

// What this browser chose for optional storage (the consent manager): a
// first-party cookie the page and the auth route both read. The server
// render reads the request's cookie, the browser `document.cookie`, once;
// `writeStorageChoice` then updates both the cookie and the shared state. The
// cookie is not strictly necessary itself, and it is exempt only because it
// stores the choice the person made about the rest.

/** The `useState` key that holds the cookie's value. */
export const STORAGE_CHOICE_STATE = 'backend:storage-choice'

/** The cookie's value in the browser, or `undefined` without one. */
function browserCookie(): string | undefined {
  return typeof document === 'undefined' ? undefined : storageFromCookieHeader(document.cookie)
}

/** Outside a Nuxt app's context (a unit test): a plain ref over the browser's cookie. */
const detached = ref<string | undefined>(undefined)
let detachedRead = false

/**
 * The raw value of this browser's choice (`preferences,replay`, `none`), or
 * `undefined` when it never chose. Reactive: a choice written through
 * {@link writeStorageChoice} updates it.
 */
export function useStorageChoice(): Ref<string | undefined> {
  if (!tryUseNuxtApp()) {
    if (!detachedRead) {
      detached.value = browserCookie()
      detachedRead = true
    }
    return detached
  }
  return useState<string | undefined>(STORAGE_CHOICE_STATE, () => (
    import.meta.server ? useCookie(STORAGE_COOKIE, { readonly: true }).value ?? undefined : browserCookie()
  ))
}

/** The purposes a stored value allows, or `null` when nothing was chosen. */
export function allowedBy(value: string | undefined): StoragePurpose[] | null {
  return parseStorage(value)
}

/** A cookie as `document.cookie` takes it: its pair, then its attributes. */
function serialize(name: string, value: string, attributes: Record<string, string | number | true>): string {
  const pairs = Object.entries(attributes).map(([key, setting]) => (setting === true ? key : [key, setting].join('=')))
  return [[encodeURIComponent(name), encodeURIComponent(value)].join('='), ...pairs].join('; ')
}

/** Delete a cookie the browser holds, on the path it was set on. */
export function deleteBrowserCookie(name: string): void {
  if (typeof document === 'undefined') return
  const gone = { 'Max-Age': 0, 'Expires': 'Thu, 01 Jan 1970 00:00:00 GMT' }
  document.cookie = serialize(name, '', { ...gone, Path: '/' })
  // Better Auth's cookie sits on the auth route's path as well.
  document.cookie = serialize(name, '', { ...gone, Path: '/api/auth' })
}

/**
 * Keep the browser's choice: the cookie, readable by the page and by the
 * auth route (never HttpOnly), for six months, and the state `choice` holds
 * (read in setup: a call after an `await` has no app to find it in).
 * Withdrawing a purpose deletes what it stored: the last-sign-in-method
 * cookie, for `preferences`, which `lastMethod` holds the state of.
 */
export function writeStorageChoice(choice: Ref<string | undefined>, value: string, allowed: readonly StoragePurpose[], lastMethod?: Ref<SignInMethod | null>): void {
  choice.value = value
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:'
  document.cookie = serialize(STORAGE_COOKIE, value, { 'Max-Age': STORAGE_COOKIE_MAX_AGE, 'Path': '/', 'SameSite': 'Lax', ...(secure ? { Secure: true as const } : {}) })
  if (!allowed.includes('preferences')) {
    deleteBrowserCookie(LAST_SIGN_IN_COOKIE)
    if (lastMethod) lastMethod.value = null
  }
}
