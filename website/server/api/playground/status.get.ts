import { probeBackend } from '../../../shared/backend-probe'

// Whether the playground's deployment answers: the header's Playground LED.
// It asks Better Auth's own `GET /api/auth/ok` on the deployment's HTTP
// actions (shared/backend-probe.ts, the probe the offline middleware runs
// too), so a deployment with the app's functions on it reads live, and one
// that is down, paused or empty does not. One upstream request a minute
// per server instance, whatever the traffic. The edge may serve an answer up
// to a minute past its age while it asks again (`stale-while-revalidate=60`),
// never longer: left open, a cache could keep showing a playground that
// went down long ago.
export default defineCachedEventHandler(async () => {
  const siteUrl = useRuntimeConfig().public.convex?.siteUrl
  if (!siteUrl) return { live: false }
  return { live: await probeBackend(siteUrl, $fetch as never) === 'live' }
}, { name: 'playground-status', maxAge: 60, swr: true, staleMaxAge: 60, getKey: () => 'status' })
