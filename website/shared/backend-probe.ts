// One probe of the playground's deployment, for the two questions the site
// asks of it: whether it is live (the header's Playground LED,
// server/api/playground/status.get.ts), and whether anything is there at all
// before a server render of a playground page (the offline middleware,
// shared/playground-offline.ts). Both ask Better Auth's own
// `GET /api/auth/ok` on the deployment's HTTP actions, with one timeout.

/** How long one probe may take. */
export const PROBE_TIMEOUT_MS = 3_000

/** A fetch as `$fetch` takes it: what a probe needs of one. */
export type ProbeFetch = (path: string, options: { baseURL: string, timeout: number, retry: 0 }) => Promise<unknown>

/**
 * What a probe found:
 * - `live`: it answered `{ ok: true }`, so the app's functions are on it;
 * - `absent`: nothing is there. The connection was refused or the name does
 *   not resolve (a local deployment that was stopped), or, for a deployment
 *   on this machine or its network, the probe failed in any way;
 * - `unsure`: something answered, or nothing answered in time. A deployment
 *   elsewhere may be slow or failing for a moment, and its pages handle that
 *   themselves.
 */
export type BackendProbe = 'live' | 'absent' | 'unsure'

/** Connection errors that mean nothing listens there, or there is no such host. */
const NOTHING_THERE = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL'])

/** Whether a site URL is on this machine or its network: a loopback host, or a `.localhost` or `.local` name. */
export function isLocalSite(siteUrl: string): boolean {
  try {
    const host = new URL(siteUrl).hostname.toLowerCase()
    return host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host) || host.endsWith('.localhost') || host.endsWith('.local')
  }
  catch {
    return false
  }
}

/** Whether a failed fetch found nothing listening: a code in its cause chain says so (`fetch failed` ← `ECONNREFUSED`). */
function nothingThere(error: unknown): boolean {
  let cause = error
  for (let depth = 0; cause && depth < 5; depth++) {
    const code = (cause as { code?: unknown }).code
    if (typeof code === 'string' && NOTHING_THERE.has(code)) return true
    cause = (cause as { cause?: unknown }).cause
  }
  return false
}

/** Probe the deployment whose HTTP actions are at `siteUrl`. Never rejects. */
export async function probeBackend(siteUrl: string, fetcher: ProbeFetch): Promise<BackendProbe> {
  const local = isLocalSite(siteUrl)
  try {
    const answer = await fetcher('/api/auth/ok', { baseURL: siteUrl, timeout: PROBE_TIMEOUT_MS, retry: 0 }) as { ok?: unknown } | null
    if (answer?.ok === true) return 'live'
    return local ? 'absent' : 'unsure'
  }
  catch (error) {
    return local || nothingThere(error) ? 'absent' : 'unsure'
  }
}
