import { Resend } from 'resend'

// What a deployment can tell of its own email, for `doctor --prod`: the
// domain its sender is on and, read with its own key through the email
// provider's SDK, what the provider says of that domain, the last seven
// days' bounces and complaints, and the quota used. Derived facts only:
// the key never leaves the deployment, and no address does either, the
// sender's included (only its domain). The backend component's
// `posture:email` action runs it with the deployment's env, the tests with
// the SDK's fetch stubbed.

/** How long one read of the provider may take before it counts as unreachable. */
const PROVIDER_TIMEOUT_MS = 5000

/** The most pages of domains read: a hundred each. */
const DOMAIN_PAGES = 5

/**
 * What the provider answered the deployment's own key:
 *
 * - `full`: the key reads the account, so the domain, the week and the
 *   quota below were read;
 * - `sending`: the key may only send, so nothing else can be read with it;
 * - `refused`: the provider refused the key (deleted, inactive or
 *   suspended): nothing is sent with it either;
 * - `unreachable`: no usable answer (a network failure, a rate limit or a
 *   server error).
 */
export type EmailProviderAccess = 'full' | 'sending' | 'refused' | 'unreachable'

/** The last seven days of sending, as the provider counts them. */
export interface EmailWeek {
  sent: number
  delivered: number
  bounced: number
  complained: number
}

/** The provider's answers, read with the deployment's key. */
export interface EmailProviderReadout {
  access: EmailProviderAccess
  /** The provider's name for a refusal, or for an unreachable answer its status: `validation_error`, `503`. */
  reason?: string
  /**
   * The sender's domain at the provider: its status (`verified`, `pending`,
   * `failed`…) and whether sending from it is on; `absent` when the account
   * holds no such domain. Left out when it was not read.
   */
  domain?: { status: string, sending: boolean } | 'absent'
  /** The last seven days; left out when they could not be read. */
  week?: EmailWeek
  /**
   * The quota used, as the provider's response headers report it: today's
   * (sent only on a plan with a daily quota) and this month's. Left out
   * when no header carried it.
   */
  quota?: { daily?: number, monthly?: number }
}

/**
 * The deployment's email, as `posture:email` reports it: the sender's
 * domain (`unset` without `EMAIL_FROM`, `malformed` when it holds no
 * address), and the provider's answers, `null` without `EMAIL_API_KEY`.
 */
export interface EmailPosture {
  sender: { domain: string } | 'unset' | 'malformed'
  provider: EmailProviderReadout | null
}

/**
 * The domain of a sender as `EMAIL_FROM` takes it, `Acme <hello@acme.dev>`
 * or `hello@acme.dev`: lower-cased, `null` when it holds no address.
 */
export function senderDomain(from: string): string | null {
  const trimmed = from.trim()
  const address = /<([^<>]+)>\s*$/.exec(trimmed)?.[1] ?? trimmed
  const match = /^[^@\s<>]+@([^@\s<>]+\.[^@\s<>.]+)$/.exec(address.trim())
  return match ? match[1]!.toLowerCase() : null
}

/** The SDK reads this file makes. */
export interface EmailProviderClient {
  domains: Pick<Resend['domains'], 'list'>
  emails: Pick<Resend['emails'], 'metrics'>
}

/** An SDK answer, as this file reads it: its data, or its error, and the response's headers. */
interface Answer {
  data: unknown
  error: { name?: unknown, statusCode?: unknown } | null
  headers: Record<string, string> | null
}

/** A count from a response header, when it holds one. */
function headerCount(answer: Answer, name: string): number | undefined {
  const raw = answer.headers?.[name]
  if (raw === undefined || raw.trim() === '') return undefined
  const count = Number(raw.trim())
  return Number.isFinite(count) && count >= 0 ? count : undefined
}

/** The quota the answer's headers report, merged over what earlier ones did. */
function quotaOf(answer: Answer, earlier: EmailProviderReadout['quota']): EmailProviderReadout['quota'] {
  const daily = headerCount(answer, 'x-resend-daily-quota') ?? earlier?.daily
  const monthly = headerCount(answer, 'x-resend-monthly-quota') ?? earlier?.monthly
  if (daily === undefined && monthly === undefined) return earlier
  return { ...daily !== undefined ? { daily } : {}, ...monthly !== undefined ? { monthly } : {} }
}

/**
 * One read's time limit, where the runtime has `AbortSignal.timeout` (as
 * src/convex/integrations/functions.ts guards it); else none.
 */
function requestOptions(): { signal?: AbortSignal } {
  return typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) } : {}
}

/** The SDK's name for an answer it could not read (no answer, or no JSON body). */
const UNREAD_ANSWER = 'application_error'

/** One read through the SDK; a rejection (it answers failures as errors, but never trust that) reads as no answer. */
async function read(request: () => Promise<Answer>): Promise<Answer> {
  try {
    return await request()
  }
  catch {
    return { data: null, error: { name: UNREAD_ANSWER, statusCode: null }, headers: null }
  }
}

/**
 * How the provider took the key, from its answer to a read: a key that may
 * only send is told by its own error name (`restricted_api_key` with a
 * `401`); a `403` of that name is an inactive key, refused like a deleted
 * or suspended one. No answer at all, a rate limit or a server error is
 * `unreachable`.
 */
function accessOf(answer: Answer): { access: EmailProviderAccess, reason?: string } {
  if (!answer.error) return { access: 'full' }
  const { name, statusCode } = answer.error
  const status = typeof statusCode === 'number' ? statusCode : null
  const reason = typeof name === 'string' && name !== UNREAD_ANSWER ? name : status !== null ? String(status) : undefined
  const access: EmailProviderAccess = status === 401 && name === 'restricted_api_key'
    ? 'sending'
    : status !== null && status >= 400 && status < 404 ? 'refused' : 'unreachable'
  return { access, ...reason ? { reason } : {} }
}

/** One domain as the listing gives it. */
interface ListedDomain {
  id?: unknown
  name?: unknown
  status?: unknown
  capabilities?: { sending?: unknown }
}

/** The sender's domain as the provider holds it: its status, and whether it sends. */
type FoundDomain = { status: string, sending: boolean }

/** A full-access readout, with the quota read so far. */
const fullAccess = (quota: EmailProviderReadout['quota']): EmailProviderReadout => ({ access: 'full', ...quota ? { quota } : {} })

/** The sender's domain on one page of the listing; else the id the next page starts after, when there is one. */
function domainOnPage(page: unknown, domain: string): { found?: FoundDomain, after?: string } {
  const body = typeof page === 'object' && page !== null ? page as Record<string, unknown> : null
  const listed = Array.isArray(body?.data) ? body.data as ListedDomain[] : []
  const match = listed.find(entry => typeof entry.name === 'string' && entry.name.toLowerCase() === domain)
  if (match) return { found: { status: typeof match.status === 'string' ? match.status : 'unknown', sending: match.capabilities?.sending !== 'disabled' } }
  const last = listed.at(-1)?.id
  return body?.has_more === true && typeof last === 'string' ? { after: last } : {}
}

/**
 * The sender's domain at the provider, read page by page: its status and
 * whether it sends, or `absent`. The first page's answer decides the key's
 * access. Left out when a later page fails, or past the pages read.
 */
async function readDomain(domain: string | null, client: EmailProviderClient): Promise<{ readout: EmailProviderReadout, found?: FoundDomain | 'absent' }> {
  const list = (after?: string) => read(() => client.domains.list({ limit: 100, ...after ? { after } : {} }, requestOptions()))
  let answer = await list()
  const access = accessOf(answer)
  if (access.access !== 'full') return { readout: access }
  let quota: EmailProviderReadout['quota']
  for (let page = 0; page < DOMAIN_PAGES && !answer.error; page++) {
    quota = quotaOf(answer, quota)
    const { found, after } = domain ? domainOnPage(answer.data, domain) : {}
    if (found || !after) return { readout: fullAccess(quota), ...domain ? { found: found ?? 'absent' } : {} }
    answer = await list(after)
  }
  return { readout: fullAccess(quota) }
}

/** A total as the metrics give it: a count, else zero. */
function total(totals: Record<string, unknown>, name: keyof EmailWeek): number {
  const value = totals[name]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

/** The last seven days' counts (the metrics' default range: today and the six days before); `undefined` when unreadable. */
async function readWeek(client: EmailProviderClient): Promise<{ week?: EmailWeek, answer: Answer }> {
  const answer = await read(() => client.emails.metrics({ metrics: ['sent', 'delivered', 'bounced', 'complained'] }, requestOptions()))
  const totals = !answer.error && typeof answer.data === 'object' && answer.data !== null ? (answer.data as { totals?: unknown }).totals : null
  if (typeof totals !== 'object' || totals === null) return { answer }
  const counts = totals as Record<string, unknown>
  return { answer, week: { sent: total(counts, 'sent'), delivered: total(counts, 'delivered'), bounced: total(counts, 'bounced'), complained: total(counts, 'complained') } }
}

/**
 * The deployment's email posture, from its own `EMAIL_FROM` and
 * `EMAIL_API_KEY`: the sender's domain, then, with a key, the provider's
 * answers about it, read with the provider's SDK (`client`, a stand-in in
 * tests). Never rejects; a read that fails is left out.
 */
export async function emailPosture(config: { from?: string, apiKey?: string }, client?: EmailProviderClient): Promise<EmailPosture> {
  const from = config.from?.trim()
  const domain = from ? senderDomain(from) : null
  const sender: EmailPosture['sender'] = !from ? 'unset' : domain ? { domain } : 'malformed'
  if (!config.apiKey) return { sender, provider: null }
  const reads = client ?? new Resend(config.apiKey)
  const { readout, found } = await readDomain(domain, reads)
  if (readout.access !== 'full') return { sender, provider: readout }
  const { week, answer } = await readWeek(reads)
  const quota = answer.error ? readout.quota : quotaOf(answer, readout.quota)
  return {
    sender,
    provider: {
      access: 'full',
      ...found ? { domain: found } : {},
      ...week ? { week } : {},
      ...quota ? { quota } : {},
    },
  }
}
