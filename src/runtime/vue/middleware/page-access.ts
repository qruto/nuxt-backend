import { defineNuxtRouteMiddleware, useNuxtApp, useRequestEvent, useRequestFetch, useRuntimeConfig } from '#imports'
import { pageAccessRules, samePagePath } from '../utils/page-rules'

/**
 * The page guard: `definePageMeta({ auth: true })`, or
 * `definePageMeta({ auth: { role, workspace, feature, hidden } })`.
 * Global, so a page's rules guard it without naming a middleware, and a
 * page without rules costs one look at its meta. The check itself loads
 * with the first page that has rules.
 *
 * On a server render it decides from the request, so a signed-in person
 * without access gets a 403 response; hydrating that render does not ask
 * again. A navigation in the browser decides from the session there.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const rules = pageAccessRules(to)
  if (rules.length === 0) return
  const nuxtApp = useNuxtApp()
  // The server decided already, for the page it rendered, and only that
  // one: a redirect a client-only plugin makes while the page hydrates
  // reaches a page the server never decided on, and a prerendered payload
  // was rendered for no one.
  const { serverRendered, prerenderedAt, path: rendered } = nuxtApp.payload
  if (import.meta.client && nuxtApp.isHydrating && serverRendered && !prerenderedAt && samePagePath(to.path, rendered)) return
  const backend = useRuntimeConfig().public.backend as { pages?: { login?: string }, authRoute?: string } | undefined
  const context = {
    loginPath: backend?.pages?.login ?? '/login',
    authRoute: backend?.authRoute ?? '/api/auth',
    event: import.meta.server ? useRequestEvent() : undefined,
    fetch: useRequestFetch() as (url: string) => Promise<unknown>,
  }
  const { guardPage } = await import('../utils/page-guard')
  return guardPage(nuxtApp, to, rules, context)
})
