import { api } from '#backend/api'

/**
 * Runs Convex functions entirely on the Nuxt (Nitro) server — no browser, no
 * WebSocket. `backendAuth(event)` forwards the signed-in user's Convex token so
 * these calls execute as that user, against the same data the live client pages
 * use. Demonstrates `fetchAuthQuery`, `fetchAuthMutation` and `fetchAuthAction`
 * (the token-aware wrappers around `fetchQuery` / `fetchMutation` /
 * `fetchAction`).
 */
export default defineEventHandler(async (event) => {
  const auth = backendAuth(event)
  const startedAt = Date.now()

  if (!(await auth.isAuthenticated())) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // fetchAuthQuery — one-shot read on the server
  const before = await auth.fetchAuthQuery(api.counter.get, { name: 'server' })
  // fetchAuthMutation — write from the server
  await auth.fetchAuthMutation(api.counter.increment, { name: 'server', by: 1 })
  // fetchAuthQuery again — observe the committed write
  const after = await auth.fetchAuthQuery(api.counter.get, { name: 'server' })
  // fetchAuthAction — run a Convex action server-side
  const echo = await auth.fetchAuthAction(api.demo.echo, {
    text: 'ran on the Nitro server',
    delayMs: 0,
  })

  return {
    authenticated: true,
    counterBefore: before.value,
    counterAfter: after.value,
    echo,
    elapsedMs: Date.now() - startedAt,
    ranAt: new Date().toISOString(),
  }
})
