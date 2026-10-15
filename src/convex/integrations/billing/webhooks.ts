// The bare specifier is deliberate: `node:buffer` would make the isolate bundle fail to resolve.
// eslint-disable-next-line unicorn/prefer-node-protocol
import { Buffer as PolyfillBuffer } from 'buffer'
import { Polar, type PolarWebhookEvent, type WebhookEventHandlers } from '@convex-dev/polar'
import { guardDelivery, parseSecretList, translateStandardSignature } from '../webhook-guard.js'
import type { BillingContext } from './context.js'
import type { BillingEntitlements } from './entitlements.js'
import { ALL_BILLING_EVENTS, REFRESH_EVENTS } from './events.js'
import type { BillingGifts } from './gifts.js'
import type { RunWriteCtx } from './types/base.js'
import type { BillingWebhookEventHandlers } from './types/setup.js'

// The provider SDK verifies webhook signatures with `Buffer.from(secret)`.
// HTTP actions run in the Convex isolate runtime, which has no `Buffer`, so
// without this every genuine delivery was answered 403 and the provider
// disabled the endpoint. The polyfill is the pure-JS `buffer` package.
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as { Buffer?: typeof PolyfillBuffer }).Buffer = PolyfillBuffer
}

function safeJsonParse(body: string): unknown {
  try {
    return JSON.parse(body)
  }
  catch {
    return body
  }
}

/**
 * Why `/billing/events` refuses every delivery when the upstream handlers
 * could not be captured — thrown, so the deployment log carries it, and kept
 * short enough to fit the delivery log's note as well.
 */
const HANDLERS_NOT_CAPTURED = '[nuxt-backend] /billing/events cannot verify any delivery: the billing provider\'s webhook handlers '
  + 'were not captured, because the installed `convex` release no longer exposes a registered http action\'s '
  + 'implementation as `_handler`. This is not a signature problem. Pin `convex` to a release nuxt-backend supports, '
  + 'or upgrade nuxt-backend.'

/** The `/billing/events` edge: the per-event handler map and the guarded handler that runs it. */
export function createWebhooks(
  { components, config, products, accessToken, environment, webhookSecret, webhookLog, provider, cache, getUserInfo }: BillingContext,
  { refreshEntitlements }: BillingEntitlements,
  { handleGiftOrderPaid }: BillingGifts,
) {
  // --- Webhook handlers: keep the cache fresh as billing state changes ---

  // Handlers run inside an httpAction at runtime, so we can refresh inline.
  /**
   * The billing entity a webhook event belongs to. Prefers the provider
   * customer metadata (set at checkout, so first-time webhooks self-bootstrap)
   * and falls back to the synced cache. Gift orders carry no `userId` metadata
   * until claimed, so they resolve to `null` here and are handled by the gift
   * branch instead.
   */
  const resolveEventEntity = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<string | null> => {
    const data = event.data as {
      id?: string
      customerId?: string
      customer?: { id?: string, metadata?: Record<string, unknown> }
      metadata?: Record<string, unknown>
    }
    const customerId = data.customerId ?? data.customer?.id ?? data.id
    if (typeof customerId !== 'string') return null
    const metaUserId = data.customer?.metadata?.userId ?? data.metadata?.userId
    if (typeof metaUserId === 'string') return metaUserId
    return await ctx.runQuery(cache.userByCustomer, { customerId })
  }

  const handleRefreshEvent = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const userId = await resolveEventEntity(ctx, event)
    if (!userId) return
    await refreshEntitlements(ctx, userId)
  }

  /**
   * A refund landed. Credit reversal itself is **provider-driven** — meter
   * credits come from the provider's benefit grants, so the refund revokes
   * them there and the refresh below simply reads the new truth.
   *
   * What this package must do is drop the entity's in-flight spend
   * reservations: the cache invariant is `provider state − reservations`, and
   * re-subtracting reservations from an already-reduced balance would leave
   * the cache below what the provider says. The reserving flows self-heal —
   * their `settle`/`release` finds nothing and the next sync is authoritative.
   */
  const handleOrderRefunded = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const clearPendingSpends = cache.clearPendingSpends
    if (!clearPendingSpends) return
    const userId = await resolveEventEntity(ctx, event)
    if (!userId) return
    await ctx.runMutation(clearPendingSpends, { userId })
  }

  // A benefit's metadata changed — patch the snapshot so friendly-key feature
  // gating (`has('premium')`) updates reactively for every entity holding it.
  const handleBenefitUpdated = async (ctx: RunWriteCtx, event: PolarWebhookEvent): Promise<void> => {
    const data = event.data as { id?: string, metadata?: Record<string, string | number | boolean> }
    if (typeof data.id !== 'string') return
    await ctx.runMutation(cache.upsertBenefitMetadata, {
      entries: [{ benefitId: data.id, metadata: data.metadata ?? {} }],
    })
  }

  // One handler per event type over the provider's FULL catalog — every
  // verified delivery gets built-in behavior (cache refresh for the refresh
  // set, snapshot patching, gift fulfilment) and then the consumer's hook,
  // which therefore reads fresh entitlements. Covering everything means no
  // authentic event is ever silently invisible.
  const consumerEvents = config.events ?? {}
  const eventTypes = new Set<string>([...ALL_BILLING_EVENTS, ...Object.keys(consumerEvents)])
  const webhookEvents = Object.fromEntries(
    [...eventTypes].map((type) => {
      const refreshes = (REFRESH_EVENTS as readonly string[]).includes(type)
      const consumerHandler = consumerEvents[type as keyof WebhookEventHandlers]
      return [type, async (ctx: RunWriteCtx, event: PolarWebhookEvent) => {
        // Reservations are dropped *before* the refresh, so the refreshed
        // cache is exactly what the provider now says.
        if (type === 'order.refunded') await handleOrderRefunded(ctx, event)
        if (refreshes) await handleRefreshEvent(ctx, event)
        if (type === 'benefit.updated') await handleBenefitUpdated(ctx, event)
        if (type === 'order.paid') await handleGiftOrderPaid(ctx, event)
        if (consumerHandler) await (consumerHandler as (ctx: RunWriteCtx, event: PolarWebhookEvent) => Promise<void>)(ctx, event)
      }]
    }),
  ) as BillingWebhookEventHandlers

  // --- The guarded webhook edge (mounted by registerBackendRoutes) ---
  //
  // Upstream verification + built-in persistence are kept byte-for-byte, but
  // the public route is OURS: the upstream handlers are captured through a
  // shim router (one per accepted secret — comma-separated rotation list) and
  // invoked behind the shared fail-closed guard. This adds: missing-secret
  // 503, 1 MiB cap, webhook-id dedupe, authentic-unknown-type 202 (instead of
  // an unparseable event 500-looping the endpoint), and outcome logging.
  const webhookSecrets = parseSecretList(webhookSecret)
  const capturedHandlers: Array<(ctx: RunWriteCtx, request: Request) => Promise<Response>> = []
  for (const secret of webhookSecrets) {
    const handlerProvider = secret === webhookSecrets[0]
      ? provider
      : new Polar(components.polar, { ...config, products, getUserInfo, organizationToken: accessToken, server: environment, webhookSecret: secret })
    const shim = {
      route: (spec: { handler: unknown }) => {
        // Registered http actions carry their implementation on `_handler`
        // (the same seam convex-test drives) — pinned by
        // test/unit/billing-webhook-edge.test.ts. Nothing falls back if it
        // moves; `handlersMissing` below turns that into a loud 500 rather
        // than a 403 per delivery. An exported handler factory is asked
        // upstream (.github/upstream.json).
        const handler = (spec.handler as { _handler?: (ctx: RunWriteCtx, request: Request) => Promise<Response> })._handler
        if (typeof handler === 'function') capturedHandlers.push(handler)
      },
    }
    handlerProvider.registerRoutes(shim as never, { path: '/billing/events', events: webhookEvents })
  }
  // One captured handler per accepted secret, or the edge cannot verify. Left
  // alone, a seam that captured nothing would answer every genuine delivery
  // 403 and log it `invalid_signature` — pointing operators at the secret.
  // Not a throw here: `setupBilling` runs at module load, and the modules that
  // import billing (http.ts with every auth route, ai.ts) would fail with it.
  const handlersMissing = capturedHandlers.length < webhookSecrets.length

  const webhookHandler = async (ctx: RunWriteCtx, request: Request): Promise<Response> => {
    const body = await request.text()
    const guard = await guardDelivery(ctx as never, webhookLog, {
      service: 'billing',
      deliveryId: request.headers.get('webhook-id'),
      bodyLength: body.length,
      secretsConfigured: webhookSecrets.length > 0,
    })
    if (guard.rejection) return guard.rejection

    if (handlersMissing) {
      // 500, so the provider keeps retrying until a fixed deployment can
      // verify the delivery; logged as a handler error with the cause. No
      // event type: nothing about an unverified body goes in the log.
      await guard.record('handler_error', { note: HANDLERS_NOT_CAPTURED })
      throw new Error(HANDLERS_NOT_CAPTURED)
    }

    const parsedType = ((): string | undefined => {
      try {
        const parsed = JSON.parse(body) as { type?: unknown }
        return typeof parsed.type === 'string' ? parsed.type : undefined
      }
      catch {
        return undefined
      }
    })()

    // The provider signs with Standard Webhooks semantics; the SDK verifies a
    // different reading of the same secret (see translateStandardSignature).
    const headers = translateStandardSignature(request.headers, body, webhookSecrets)
    let lastForbidden: Response | null = null
    for (const handler of capturedHandlers) {
      const attempt = new Request(request.url, { method: 'POST', headers, body })
      try {
        const response = await handler(ctx, attempt)
        if (response.status === 403) {
          // Signature mismatch — try the next accepted secret (verification
          // has no side effects).
          lastForbidden = response
          continue
        }
        await guard.record('ok', { type: parsedType })
        return response
      }
      catch (error) {
        if ((error as { name?: string })?.name === 'SDKValidationError') {
          // Authentic (signature passed before parsing) but unparseable by
          // the installed SDK — acknowledge instead of 500-looping.
          if (config.onUnknownEvent) {
            await config.onUnknownEvent(ctx, { type: parsedType, payload: safeJsonParse(body) })
          }
          await guard.record('unknown_type', { type: parsedType })
          return new Response('Accepted (unknown event type)', { status: 202 })
        }
        await guard.record('handler_error', {
          type: parsedType,
          note: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    }
    await guard.record('invalid_signature')
    return lastForbidden ?? new Response('Invalid signature', { status: 403 })
  }

  return { webhookEvents, webhookHandler }
}
