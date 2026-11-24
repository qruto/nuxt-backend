import { handleWebhookDelivery, type WebhookLogRefs } from '../webhook-guard.js'
import type { CommerceProvider, NeutralBillingEvent } from './providers/types.js'

// `/billing/events` for a provider on the neutral adapters (Stripe Managed
// Payments, Dodo, Creem): the same guarded edge Polar's deliveries go
// through (webhook-guard.ts: 503 without a secret, 413 over the cap, the
// redelivery dedupe, the delivery log), with the adapter's verifier and its
// neutral reading of the event in place of Polar's SDK.

/** What the app does with a verified, neutral billing event. It must be idempotent: a provider retries until it gets a 2xx. */
export type CommerceEventHandler<Ctx> = (ctx: Ctx, event: NeutralBillingEvent, delivery: { id: string }) => Promise<void>

/** The options of {@link createCommerceWebhookHandler}. */
export interface CommerceWebhookOptions<Ctx> {
  provider: CommerceProvider
  /** The accepted signing secrets, first entry primary (`BILLING_WEBHOOK_SECRET`, comma-separated while rotating). */
  secrets: readonly string[]
  /** `components.backend.webhooks`: the delivery log the dedupe reads. */
  webhookLog: WebhookLogRefs
  onEvent: CommerceEventHandler<Ctx>
}

/** The delivery id a body names (Stripe's and Creem's event `id`), before anything verifies it. */
function bodyEventId(body: string): string | null {
  try {
    const id = (JSON.parse(body) as { id?: unknown }).id
    return typeof id === 'string' && id.length <= 200 ? id : null
  }
  catch {
    return null
  }
}

/**
 * The handler an app passes as `billing.webhookHandler` to `registerBackendRoutes`
 * for an adapter provider. `BILLING_PROVIDER` does not mount it.
 *
 * @experimental
 */
export function createCommerceWebhookHandler<Ctx>({ provider, secrets, webhookLog, onEvent }: CommerceWebhookOptions<Ctx>) {
  return (ctx: Ctx, request: Request): Promise<Response> => handleWebhookDelivery(ctx, webhookLog, {
    service: 'billing',
    // The id the signature covers: Dodo signs to Standard Webhooks, which
    // covers the `webhook-id` header; Stripe and Creem sign the body alone,
    // so a header there could be changed on a replay to slip the dedupe.
    deliveryId: provider.name === 'dodo' ? request.headers.get('webhook-id') : null,
    bodyDeliveryId: bodyEventId,
    request,
    secretsConfigured: secrets.length > 0,
    verify: async (_parsed, body) => {
      let verified
      try {
        verified = await provider.verifyWebhook(body, request.headers, secrets)
      }
      catch (error) {
        // A signature that verified over a body that is no JSON: nothing can run.
        return { outcome: 'handler_error', note: `${provider.name} delivery could not be read: ${error instanceof Error ? error.name : 'error'}`, response: new Response('Unreadable event', { status: 400 }) }
      }
      if (!verified) return { outcome: 'invalid_signature' }
      const { event } = verified
      if (event.type === 'ignored') {
        // The delivery log keeps its type, noted ignored: nothing the package keeps changed.
        return { outcome: 'ok', type: event.providerType, note: 'ignored', response: new Response('OK', { status: 200 }) }
      }
      await onEvent(ctx, event, { id: verified.id })
      return { outcome: 'ok', type: event.providerType, response: new Response('OK', { status: 200 }) }
    },
  })
}
