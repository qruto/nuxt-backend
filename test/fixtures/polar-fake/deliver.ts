import { randomUUID } from 'node:crypto'
import { Webhook } from 'standardwebhooks'
import type { DeliveryRecord, EndpointRecord, FakeState } from './state'
import { toWire, type WireInput, type WireName } from './wire'

// Webhook deliveries, the way the provider makes them: one signed POST per
// event to every enabled endpoint, Standard Webhooks headers, and retries
// with backoff until the endpoint answers 2xx (a local deployment that is
// still starting gets its events once it is up).

/** The event types the fake provider emits, and the model each one carries. */
export const EVENT_DATA = {
  'checkout.created': 'checkout',
  'checkout.updated': 'checkout',
  'customer.created': 'customer',
  'customer.updated': 'customer',
  'customer.deleted': 'customer',
  'customer.state_changed': 'customer-state',
  'member.created': 'member',
  'member.deleted': 'member',
  'order.created': 'order',
  'order.paid': 'order',
  'order.updated': 'order',
  'order.refunded': 'order',
  'subscription.created': 'subscription',
  'subscription.updated': 'subscription',
  'subscription.active': 'subscription',
  'subscription.canceled': 'subscription',
  'subscription.uncanceled': 'subscription',
  'subscription.revoked': 'subscription',
  'subscription.past_due': 'subscription',
  'refund.created': 'refund',
  'product.created': 'product',
  'product.updated': 'product',
  'benefit.created': 'benefit',
  'benefit.updated': 'benefit',
  'benefit_grant.created': 'benefit-grant',
  'benefit_grant.cycled': 'benefit-grant',
  'benefit_grant.revoked': 'benefit-grant',
} as const satisfies Record<string, WireName>

export type FakeEventType = keyof typeof EVENT_DATA

/** The model an event of this type carries. */
export type EventData<Type extends FakeEventType> = WireInput<(typeof EVENT_DATA)[Type]>

/** How long to wait before each retry of a delivery that failed. */
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 120_000]

/** How long one delivery may take before it counts as failed and is retried. */
const DELIVERY_TIMEOUT_MS = 30_000

/** How many deliveries the home page lists. */
const DELIVERY_LOG = 100

/** How many sent events the fake keeps for a redelivery, oldest dropped first. */
const REDELIVERABLE = 200

/** Add a delivery to the log the home page lists, newest first, the oldest dropped past its length. */
export function logDelivery(state: FakeState, entry: DeliveryRecord): void {
  state.deliveries.unshift(entry)
  state.deliveries.length = Math.min(state.deliveries.length, DELIVERY_LOG)
}

/** Base64 of a string's UTF-8 bytes: the provider SDK's reading of a secret without the `whsec_` prefix. */
function sdkReading(secret: string): string {
  return Buffer.from(secret, 'utf8').toString('base64')
}

/**
 * The `webhook-signature` header for a delivery: Standard Webhooks over the
 * secret's own reading — a `whsec_` secret is base64 after its prefix, as
 * the provider signs; any other is its UTF-8 bytes, as the provider SDK
 * verifies.
 */
export function signDelivery(secret: string, id: string, timestamp: Date, body: string): string {
  return new Webhook(secret.startsWith('whsec_') ? secret : sdkReading(secret)).sign(id, timestamp, body)
}

/** One message on its way to one endpoint. */
interface Message {
  id: string
  type: string
  body: string
  endpoint: EndpointRecord
  attempts: number
}

export interface DeliveryOptions {
  state: FakeState
  /** How a delivery is sent: `fetch`, or a test's own route into the deployment. */
  fetcher: (url: string, init: RequestInit) => Promise<Response>
  now: () => number
  /** Called when the delivery log changed, so the state is saved. */
  onChange: () => void
  log: (line: string) => void
}

/** The delivery queue of one fake. */
export function createDeliveries({ state, fetcher, now, onChange, log }: DeliveryOptions) {
  const queue: Message[] = []
  // The events sent, by id, for a redelivery: the provider sends the same event, id and body again.
  const sent = new Map<string, Message>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let running: Promise<void> | null = null
  let waiting: Array<() => void> = []

  const record = (message: Message, status: number | null, error?: string) => {
    logDelivery(state, { id: message.id, type: message.type, url: message.endpoint.url, status, attempts: message.attempts, at: now(), ...(error ? { error } : {}) })
    onChange()
  }

  const retry = (message: Message) => {
    const delay = RETRY_DELAYS_MS[message.attempts - 1]
    if (delay === undefined) {
      log(`gave up on ${message.type} to ${message.endpoint.url} after ${message.attempts} attempts`)
      return
    }
    const timer = setTimeout(() => {
      timers.delete(timer)
      queue.push(message)
      void drain()
    }, delay)
    timer.unref?.()
    timers.add(timer)
  }

  const send = async (message: Message) => {
    // An endpoint removed since (the deployment's, replaced at a new
    // address) takes nothing more: its deliveries could only fail.
    if (state.endpoints[message.endpoint.id] !== message.endpoint) return
    message.attempts += 1
    sent.set(message.id, message)
    if (sent.size > REDELIVERABLE) sent.delete(sent.keys().next().value!)
    const timestamp = new Date(now())
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'polar-fake',
      'webhook-id': message.id,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': signDelivery(message.endpoint.secret, message.id, timestamp, message.body),
    }
    try {
      const response = await fetcher(message.endpoint.url, { method: 'POST', headers, body: message.body, signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS) })
      record(message, response.status)
      if (!response.ok) retry(message)
    }
    catch (error) {
      record(message, null, error instanceof Error ? error.message : String(error))
      retry(message)
    }
  }

  const drain = async (): Promise<void> => {
    if (running) return running
    running = (async () => {
      for (let message = queue.shift(); message; message = queue.shift()) await send(message)
    })()
    await running
    running = null
    const settled = waiting
    waiting = []
    for (const resolve of settled) resolve()
  }

  /** Queue an event for every enabled endpoint that takes its type. */
  const emit = <Type extends FakeEventType>(type: Type, data: EventData<Type>): void => {
    const body = JSON.stringify({ type, timestamp: new Date(now()).toISOString(), data: toWire(EVENT_DATA[type], data as never) })
    for (const endpoint of Object.values(state.endpoints)) {
      if (!endpoint.enabled || (endpoint.events.length > 0 && !endpoint.events.includes(type))) continue
      queue.push({ id: `msg_${randomUUID().replaceAll('-', '')}`, type, body, endpoint, attempts: 0 })
    }
    // After the response that caused the event: a deployment acting on it
    // reads the fake provider back, as it would read the provider.
    setImmediate(() => void drain())
  }

  /**
   * Send an event again, as the provider's redelivery does: the same id and
   * body, signed afresh. `false` for an event the fake never sent.
   */
  const redeliver = (id: string): boolean => {
    const message = sent.get(id)
    if (!message) return false
    queue.push({ ...message, attempts: 0 })
    setImmediate(() => void drain())
    return true
  }

  /** Resolves once every queued delivery was attempted (a scheduled retry aside). */
  const idle = (): Promise<void> => new Promise((resolve) => {
    if (!running && queue.length === 0) {
      setImmediate(() => (running || queue.length > 0 ? waiting.push(resolve) : resolve()))
      return
    }
    waiting.push(resolve)
  })

  /** Stop the pending retries. */
  const close = () => {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
  }

  return { emit, redeliver, idle, close }
}

export type Deliveries = ReturnType<typeof createDeliveries>
