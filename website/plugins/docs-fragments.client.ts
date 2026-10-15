import { DOCS_FRAGMENT_MOVES } from '../shared/docs-routes'

/**
 * Finishes the trip for an old anchor whose section moved to another page.
 * A redirect keeps the URL fragment, so `/old-page#section` lands on the page
 * the old route now points at, with the old anchor; DOCS_FRAGMENT_MOVES
 * (shared/docs-routes.ts) knows where that section went. Client-only: a
 * fragment never reaches the server.
 */
export default defineNuxtPlugin(() => {
  if (Object.keys(DOCS_FRAGMENT_MOVES).length === 0) return
  const follow = (path: string, hash: string) => {
    const to = hash ? DOCS_FRAGMENT_MOVES[`${path}${hash}`] : undefined
    if (to) return navigateTo(to, { replace: true })
  }
  const route = useRoute()
  follow(route.path, route.hash)
  useRouter().afterEach(to => follow(to.path, to.hash))
})
