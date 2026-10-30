// The dev inbox: the mail a deployment sent to one of the email provider's
// test addresses, read back from the provider's own log of sent email. The
// package keeps no copy, so the provider's log is the inbox. Runtime-neutral
// (it needs only `fetch`), so the backend component's action and the tests
// share it.
//
// The provider allows 10 requests a second per team, and a dev inbox is
// polled by every open page: a read is two requests (one list, one
// retrieval of the newest body), a page asks at most every 10 seconds, and a
// short cache answers repeat reads without asking the provider again. The
// cache holds the provider's answers, not the addresses asked about: the
// list is one for every address, and a body one per email, so asking for
// many addresses (a `+label` each) costs the provider no more than asking
// for one.

/** The provider's API. */
const PROVIDER_API = 'https://api.resend.com'

/** How far back the inbox reads: long enough to read a code. */
export const SANDBOX_INBOX_WINDOW_MS = 60 * 60 * 1000

/** The most messages the inbox returns for one address, newest first. */
export const SANDBOX_INBOX_LIMIT = 10

/** Only the newest message comes with its body: a code is in the latest, and each body is one more call to the provider. */
export const SANDBOX_INBOX_BODIES = 1

/** The provider lists at most this many sent emails in one call, and the inbox reads one call: the newest hundred. */
const LIST_SIZE = 100

/** How long a read of an address answers the reads that follow it, in ms: they cost the provider no request. */
export const SANDBOX_INBOX_CACHE_MS = 5000

/** The most addresses the cache holds before it drops the ones past their time. */
const CACHE_MAX_ENTRIES = 200

/** A message in the dev inbox. */
export interface SandboxMessage {
  from: string
  subject: string
  text?: string
  html?: string
  /** When the provider accepted it, as epoch ms. */
  receivedAt: number
}

/** A read of the provider that failed, with the HTTP status when it answered. */
export class SandboxInboxError extends Error {
  readonly status: number | undefined
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SandboxInboxError'
    this.status = status
  }
}

interface ListedEmail {
  id: string
  to: string[] | string | null
  from: string
  subject: string | null
  created_at: string
}

interface RetrievedEmail {
  html?: string | null
  text?: string | null
}

/** The bare address of `Name <address>`, lower-cased. */
function bare(address: string): string {
  return (/<([^>]+)>/.exec(address)?.[1] ?? address).trim().toLowerCase()
}

/** The provider writes times as `2026-04-03 22:13:42.674981+00`: read that, and an ISO time, as epoch ms. */
export function providerTime(value: string): number {
  const iso = value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  return Date.parse(iso)
}

async function call<T>(path: string, apiKey: string, fetcher: typeof fetch): Promise<T> {
  let response: Response
  try {
    response = await fetcher(`${PROVIDER_API}${path}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } })
  }
  catch (error) {
    throw new SandboxInboxError(`The email provider could not be reached: ${error instanceof Error ? error.message : String(error)}.`)
  }
  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403
      ? ' (EMAIL_API_KEY is wrong, or is restricted to sending: reading sent mail needs full access)'
      : response.status === 429 ? ' (the rate limit: try again in a second)' : ''
    throw new SandboxInboxError(`The email provider answered ${response.status} to a read of sent email${hint}.`, response.status)
  }
  return await response.json() as T
}

/** Who a listed email went to, as a list. */
function recipientsOf(email: ListedEmail): string[] {
  if (Array.isArray(email.to)) return email.to
  return email.to ? [email.to] : []
}

/** The emails among the provider's newest hundred that went to the address within the window, newest first. */
async function listFor(read: Reader, wanted: string, since: number): Promise<Array<ListedEmail & { at: number }>> {
  const listing = await read<{ data?: ListedEmail[] }>(`/emails?limit=${LIST_SIZE}`)
  const found: Array<ListedEmail & { at: number }> = []
  for (const email of listing.data ?? []) {
    const at = providerTime(email.created_at)
    if (!Number.isNaN(at) && at >= since && recipientsOf(email).some(recipient => bare(recipient) === wanted)) found.push({ ...email, at })
  }
  return found.sort((a, b) => b.at - a.at).slice(0, SANDBOX_INBOX_LIMIT)
}

/** One request to the provider, by its path. */
type Reader = <T>(path: string) => Promise<T>

/**
 * A short memory of the provider's answers, by request. Reads that come
 * while one is under way, or within `ttl` after it, share its answer (or
 * its failure, so a refused read is not asked again at once), so any number
 * of open pages, for any number of addresses, cost the provider one list
 * per `ttl`, and one retrieval per email shown. Held in memory in the
 * isolate that made it: another isolate asks again, and no mail is written
 * anywhere.
 */
export interface SandboxInboxCache {
  /** The answer to `key`, from `load` when none is fresh. */
  read: <T>(key: string, load: () => Promise<T>) => Promise<T>
}

/** A {@link SandboxInboxCache} whose answers last `ttl` ms after their read ends. */
export function createSandboxInboxCache({ ttl = SANDBOX_INBOX_CACHE_MS, clock = () => Date.now() }: { ttl?: number, clock?: () => number } = {}): SandboxInboxCache {
  const entries = new Map<string, { until: number, answer: Promise<unknown> }>()
  return {
    read<T>(key: string, load: () => Promise<T>): Promise<T> {
      const known = entries.get(key)
      if (known && known.until > clock()) return known.answer as Promise<T>
      const entry = { until: Number.POSITIVE_INFINITY, answer: load() }
      const settled = () => {
        entry.until = clock() + ttl
      }
      entry.answer.then(settled, settled)
      if (entries.size >= CACHE_MAX_ENTRIES) {
        for (const [other, { until }] of entries) if (until <= clock()) entries.delete(other)
      }
      entries.set(key, entry)
      return entry.answer as Promise<T>
    },
  }
}

/**
 * The mail the provider holds for a test address, sent within the window,
 * newest first. The provider's list names each sent email but carries no
 * body, so the newest is retrieved for its: two requests a read. With a
 * `cache`, reads share the list, and each body, whatever address they ask.
 */
export async function readSandboxMail(
  { apiKey, address, now = Date.now(), fetcher = fetch, cache }: { apiKey: string, address: string, now?: number, fetcher?: typeof fetch, cache?: SandboxInboxCache },
): Promise<SandboxMessage[]> {
  const wanted = address.trim().toLowerCase()
  const read: Reader = <T>(path: string) => {
    const load = () => call<T>(path, apiKey, fetcher)
    return cache ? cache.read(path, load) : load()
  }
  const newest = await listFor(read, wanted, now - SANDBOX_INBOX_WINDOW_MS)
  const bodies = await Promise.all(newest.slice(0, SANDBOX_INBOX_BODIES).map(email => read<RetrievedEmail>(`/emails/${encodeURIComponent(email.id)}`)))
  return newest.map((email, index) => ({
    from: email.from,
    subject: email.subject ?? '',
    ...(bodies[index]?.text ? { text: bodies[index].text } : {}),
    ...(bodies[index]?.html ? { html: bodies[index].html } : {}),
    receivedAt: email.at,
  }))
}
