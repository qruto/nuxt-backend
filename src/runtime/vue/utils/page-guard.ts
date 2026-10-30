import { effectScope, inject } from 'vue'
import { until } from '@vueuse/core'
import type { RouteLocationNormalized } from 'vue-router'
import type { NuxtApp, NuxtError } from '#app'
import { navigateTo } from '#imports'
import { authClient, useBetterAuth } from 'nuxt-convex-module/better-auth/client'
import { ConvexAuthStateKey, useConvex } from 'nuxt-convex-module/client'
import { makeFunctionReference } from 'convex/server'
import { grantsFeature } from '../../../convex/catalog.js'
import type { ConvexAuthEvent } from 'nuxt-convex-module/better-auth/server'
import type { AccessDeniedData, PageAccessRules } from './access-rules'
import { accessDenial, accessDeniedError, type AccessSubject, hiddenPageError, isHidden } from './page-access'
import { appRole } from './roles'
import { shareablePath } from './session-end'

// The page guard's work, loaded only once a navigation reaches a page with
// `auth` rules: who the person is, then whether their rules let them in.
// The global middleware (../middleware/page-access.ts) stays a few lines on
// every other page.

/** What the middleware reads in the app's context before the guard loads. */
export interface PageGuardContext {
  /** The sign-in page's path (`pages.login`). */
  loginPath: string
  /** The same-origin auth route (`backend.authRoute`). */
  authRoute: string
  /** The request, on a server render. */
  event?: ConvexAuthEvent
  /** `useRequestFetch()`: on the server, a fetch that forwards the request's cookies. */
  fetch: (url: string) => Promise<unknown>
}

/**
 * A token's claims, read without checking its signature: the server fetched
 * the token from the auth server for this request (`backendAuth(event)`),
 * so it is not the browser's word. `{}` for anything that is not a JWT.
 */
export function tokenClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (!payload) return {}
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? claims as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
}

/** The role an active-member answer names, or `null` without an active workspace. */
function memberRole(member: unknown): string | null {
  const role = (member as { role?: unknown } | null | undefined)?.role
  return typeof role === 'string' && role ? role : null
}

/**
 * The features read of the scaffolded `backend/billing.ts`, the one
 * `useFeatures` reads: the plan's benefits of the caller's billing entity,
 * the active workspace by default; `null` for a caller it does not know.
 */
const FEATURES = makeFunctionReference<'query', Record<string, never>, { benefits?: Array<{ metadata?: Record<string, unknown> }> } | null>('billing:getFeatures')

/** Whether a features answer grants `feature`; nothing read grants nothing. */
function granted(features: { benefits?: Array<{ metadata?: Record<string, unknown> }> } | null | undefined, feature: string): boolean {
  return features?.benefits?.some(benefit => grantsFeature(benefit as never, feature)) ?? false
}

/**
 * The signed-in person on a server render, or `null` when signed out or with
 * no request to read: the token the SSR plugin fetched for this request,
 * the active workspace's member row from the auth server, asked through the
 * app's auth route with the request's cookies, and the plan's features from
 * the deployment as the person. A token that cannot be fetched fails the
 * render; features that cannot be read grant none.
 *
 * @internal
 */
export async function serverSubject(context: PageGuardContext): Promise<AccessSubject | null> {
  if (!context.event) return null
  const { convexAuth } = await import('nuxt-convex-module/better-auth/server')
  const auth = convexAuth(context.event)
  const token = await auth.getToken()
  if (!token) return null
  const claims = tokenClaims(token)
  const role = appRole(claims)
  return {
    role,
    banned: claims.banned === true,
    workspaceRole: async () => memberRole(await context.fetch(`${context.authRoute}/organization/get-active-member`).catch(() => null)),
    hasFeature: async feature => granted(await auth.fetchAuthQuery(FEATURES, {}).catch(() => null), feature),
  }
}

/**
 * The signed-in person in the browser, or `null` once the session settled
 * signed out: the session the auth client holds, the active workspace's
 * member row, asked fresh, and the plan's features, read once the
 * deployment knows the session (a read before that would answer for no one).
 */
async function clientSubject(nuxtApp: NuxtApp): Promise<AccessSubject | null> {
  // The session store, read once: its subscription goes with the scope, so
  // a navigation leaves no listener behind on the session.
  const scope = effectScope(true)
  const { session } = scope.run(() => useBetterAuth())!
  let user: { role?: unknown, banned?: unknown } | undefined
  try {
    await until(() => session.value.isPending).toBe(false)
    user = (session.value.data as { user?: typeof user } | null | undefined)?.user
  }
  finally {
    scope.stop()
  }
  if (!user) return null
  const role = appRole(user)
  return {
    role,
    banned: user.banned === true,
    workspaceRole: async () => {
      const answer = await authClient.organization.getActiveMember().catch(() => null)
      return memberRole(answer?.data)
    },
    hasFeature: async (feature) => {
      const { client, state } = nuxtApp.vueApp.runWithContext(() => ({ client: useConvex(), state: inject(ConvexAuthStateKey, null) }))
      if (state) await until(state.isLoading).toBe(false)
      return granted(await client.query(FEATURES, {}).catch(() => null), feature)
    },
  }
}

/**
 * Check a navigation to a page with `auth` rules: a signed-out person goes
 * to the sign-in page with `?redirect=` back, a signed-in one who fails a
 * rule gets the 403 the app's error page renders, and anyone else passes.
 * A hidden page answers both of the first two with the 404 of a page that
 * does not exist.
 */
export async function guardPage(nuxtApp: NuxtApp, to: RouteLocationNormalized, rules: readonly PageAccessRules[], context: PageGuardContext): Promise<NuxtError<AccessDeniedData> | NuxtError | ReturnType<typeof navigateTo> | undefined> {
  const subject = import.meta.server ? await serverSubject(context) : await clientSubject(nuxtApp)
  const path = shareablePath(to)
  const hidden = isHidden(rules)
  if (!subject) {
    if (to.path === context.loginPath) return undefined
    if (hidden) return hiddenPageError(path)
    return nuxtApp.runWithContext(() => navigateTo({ path: context.loginPath, query: { redirect: path } }))
  }
  const reason = await accessDenial(rules, subject)
  if (!reason) return undefined
  return hidden ? hiddenPageError(path) : accessDeniedError(reason, path)
}
