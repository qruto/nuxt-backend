// The billing provider's fake `nuxt-backend/test` hands an app: `fetch`
// answered for the provider's usage-event ingest, as its API answers it, so
// a test of credits that reach the provider (a job's charge, a refund, a
// cost report) runs the package's real billing with no network and no
// account. Each event is kept once by its idempotency key, as the provider
// keeps it, and a switch refuses the next charges or refunds with a 503.
// Development and production never load it.

/** The provider's API hosts: the sandbox tests bill in, and production. */
const PROVIDER_HOSTS = new Set(['sandbox-api.polar.sh', 'api.polar.sh'])

/** The usage-event ingest, as the provider's API serves it. */
const INGEST_PATH = '/v1/events/ingest'

/**
 * A usage event the fake billing provider took.
 *
 * @experimental
 */
export interface TestUsageEvent {
  /** The event's name: the meter's event name, or `job.cost` for a job's cost report. */
  name: string
  /** The billing entity it bills, as the provider's external customer id: a workspace, or an account under `billTo: 'user'`. */
  customer: string
  /** Its idempotency key: a second event with the same key is a duplicate the provider drops. */
  externalId?: string
  /** The credits it moves, read from its numeric metadata (the sum meter's property): positive for a charge, negative for a refund; absent for a report. */
  value?: number
  /** Its metadata as sent: the meter's property, and what the charge named (`userId`, `job`, an app's own keys). */
  metadata: Record<string, unknown>
}

/**
 * What {@link stubBillingProvider} answers with, and what it took.
 *
 * @experimental
 */
export interface TestBillingProvider {
  /** Every event it took, in order, each idempotency key once. */
  readonly events: readonly TestUsageEvent[]
  /** The charges it took: events that move credits up. */
  readonly charges: readonly TestUsageEvent[]
  /** The refunds it took: events that move credits back, their `value` negative. */
  readonly refunds: readonly TestUsageEvent[]
  /** How many ingest calls it refused. */
  readonly refused: number
  /**
   * Refuse the next charges (or refunds) with a 503, as a provider having
   * trouble does: `times` of them, or every one until `accept()`.
   * A refused event is not kept, so a retry under its key is new.
   */
  refuse: (what?: 'charges' | 'refunds', times?: number) => void
  /** Take every event again. */
  accept: () => void
  /** Put the `fetch` it replaced back: call it after the test. */
  restore: () => void
}

/**
 * How {@link stubBillingProvider} answers.
 *
 * @experimental
 */
export interface StubBillingProviderOptions {
  /** The status a refused event gets. Default `503`. */
  status?: number
}

type Refusals = { charges: number, refunds: number }

/** A wire event's credits: its first finite number, the meter's property; the reserved `_cost` and `_llm` are not credits. */
function valueOf(metadata: Record<string, unknown>): number | undefined {
  for (const [key, value] of Object.entries(metadata)) {
    if (!key.startsWith('_') && typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/** A wire field that is text, or nothing. */
const textOf = (value: unknown): string => typeof value === 'string' ? value : ''

/** A wire event, as the provider reads it (snake case). */
function eventOf(entry: Record<string, unknown>): TestUsageEvent {
  const metadata = (entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}) as Record<string, unknown>
  const value = valueOf(metadata)
  return {
    name: textOf(entry.name),
    customer: textOf(entry.external_customer_id ?? entry.customer_id),
    ...(typeof entry.external_id === 'string' ? { externalId: entry.external_id } : {}),
    ...(value === undefined ? {} : { value }),
    metadata,
  }
}

/** Whether the next refusal falls on these events: a batch holding a charge counts as a charge, one holding a refund as a refund. */
function takesRefusal(refusals: Refusals, events: readonly TestUsageEvent[]): boolean {
  for (const kind of ['charges', 'refunds'] as const) {
    if (refusals[kind] <= 0) continue
    if (!events.some(event => event.value !== undefined && (kind === 'charges' ? event.value > 0 : event.value < 0))) continue
    refusals[kind]--
    return true
  }
  return false
}

/**
 * Answer the billing provider's usage-event ingest in `fetch`, as its API
 * would: every charge, refund and cost report the package's billing sends
 * is taken and kept once by its idempotency key, and reported back in
 * `events`, `charges` and `refunds`. Any other request goes to the `fetch`
 * it replaced, so it composes with `stubStorageFetch` in either order.
 * Returns the fake, with `restore` to put `fetch` back.
 *
 * A charge reaches the provider only for an entity that is its customer:
 * give it one with `seedBilling(t, entityId, { customer: true, credits })`.
 * Without one, the charge is refused `not_ready` (`no_customer`) before any
 * event is sent.
 *
 * @experimental
 *
 * @param options - The status a refused event gets.
 *
 * @example
 * ```ts
 * let provider: TestBillingProvider
 * beforeEach(() => { provider = stubBillingProvider() })
 * afterEach(() => provider.restore())
 *
 * test('a refused charge stays owed, then lands', async () => {
 *   provider.refuse('charges', 1)
 *   // …run the job with drain(t, vi)…
 *   expect(provider.charges).toEqual([expect.objectContaining({ value: 3, metadata: expect.objectContaining({ stripId }) })])
 * })
 * ```
 */
export function stubBillingProvider(options: StubBillingProviderOptions = {}): TestBillingProvider {
  const status = options.status ?? 503
  const events: TestUsageEvent[] = []
  const refusals: Refusals = { charges: 0, refunds: 0 }
  let refused = 0
  const original = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (!PROVIDER_HOSTS.has(url.host)) return original(input, init)
    if (request.method !== 'POST' || url.pathname !== INGEST_PATH) {
      return Response.json({ error: 'NotFound', detail: `The fake billing provider answers ${INGEST_PATH} only, not ${request.method} ${url.pathname}.` }, { status: 404 })
    }
    const body = await request.json() as { events?: Array<Record<string, unknown>> }
    const batch = (body.events ?? []).map(eventOf)
    if (takesRefusal(refusals, batch)) {
      refused++
      return Response.json({ error: 'ServiceUnavailable', detail: 'The fake billing provider refused this event, as asked.' }, { status })
    }
    let inserted = 0
    let duplicates = 0
    for (const event of batch) {
      if (event.externalId !== undefined && events.some(kept => kept.externalId === event.externalId)) {
        duplicates++
        continue
      }
      events.push(event)
      inserted++
    }
    return Response.json({ inserted, duplicates })
  }
  return {
    events,
    get charges() {
      return events.filter(event => event.value !== undefined && event.value > 0)
    },
    get refunds() {
      return events.filter(event => event.value !== undefined && event.value < 0)
    },
    get refused() {
      return refused
    },
    refuse: (what = 'charges', times = Number.POSITIVE_INFINITY) => {
      refusals[what] = times
    },
    accept: () => {
      refusals.charges = 0
      refusals.refunds = 0
    },
    restore: () => {
      globalThis.fetch = original
    },
  }
}
