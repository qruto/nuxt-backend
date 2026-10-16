// Whether the playground's deployment answers: the header's Playground LED.
// It asks Better Auth's own `GET /api/auth/ok` on the deployment's HTTP
// actions, so a deployment with the app's functions on it reads live, and
// one that is down, paused or empty does not. One upstream request a minute
// per server instance, whatever the traffic.
export default defineCachedEventHandler(async () => {
  const siteUrl = useRuntimeConfig().public.convex?.siteUrl
  if (!siteUrl) return { live: false }
  try {
    const answer = await $fetch<{ ok?: boolean }>('/api/auth/ok', { baseURL: siteUrl, timeout: 3000, retry: 0 })
    return { live: answer?.ok === true }
  }
  catch {
    return { live: false }
  }
}, { name: 'playground-status', maxAge: 60, swr: true, getKey: () => 'status' })
