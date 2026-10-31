/**
 * Finishes the trip for an old anchor whose section moved to another page.
 * A redirect keeps the URL fragment, so `/old-page#section` lands on the page
 * the old route now points at, with the old anchor; DOCS_FRAGMENT_MOVES
 * (shared/docs-fragment-moves.ts) knows where that section went. Client-only: a
 * fragment never reaches the server.
 *
 * The map loads only for a route with a fragment: most visits carry none,
 * and the map would be a few kilobytes of every docs page's initial
 * JavaScript.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  let moves: Promise<Record<string, string>> | undefined
  const follow = async (path: string, hash: string) => {
    if (!hash) return
    moves ??= import('../shared/docs-fragment-moves').then(module => module.DOCS_FRAGMENT_MOVES)
    const to = (await moves)[`${path}${hash}`]
    if (to) await router.replace(to)
  }
  const route = useRoute()
  void follow(route.path, route.hash)
  router.afterEach(to => void follow(to.path, to.hash))
})
