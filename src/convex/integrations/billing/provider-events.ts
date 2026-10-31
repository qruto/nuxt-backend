// The bare specifier is deliberate: `node:buffer` would make the isolate bundle fail to resolve.
// eslint-disable-next-line unicorn/prefer-node-protocol
import { Buffer as PolyfillBuffer } from 'buffer'
import type { PolarWebhookEvent } from '@convex-dev/polar'
import { validateEvent } from '@polar-sh/sdk/webhooks'
import type { FunctionReference } from 'convex/server'
import { Webhook } from 'standardwebhooks'
import type { RunWriteCtx } from './types/base.js'

// What `/billing/events` does with a delivery the one verifier
// (`webhook-signatures.ts`) already accepted: parse it into the provider
// SDK's typed event, and keep the provider component's own tables in step,
// as the provider component's route would. The package's handlers run on
// the parsed event after that (webhooks.ts).

// The SDK reads a secret with `Buffer.from(secret)` when it parses an event.
// HTTP actions run in the Convex isolate runtime, which has no `Buffer`, so
// without this every genuine delivery failed to parse. The polyfill is the
// pure-JS `buffer` package.
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as { Buffer?: typeof PolyfillBuffer }).Buffer = PolyfillBuffer
}

/**
 * The key the parse signs a verified body with: the SDK's only public way
 * to read an event into its typed shape (dates, camelCase, the per-type
 * schema) is `validateEvent`, which checks a signature first. The body was
 * verified already, against the app's secrets, so this signature proves
 * nothing and guards nothing: it only opens the parse.
 */
const PARSE_KEY = 'nuxt-backend:billing-event'
const parseSigner = new Webhook(new TextEncoder().encode(PARSE_KEY), { format: 'raw' })

/**
 * A verified delivery's body as the provider SDK's typed event. Throws the
 * SDK's `SDKValidationError` for a type the installed SDK does not know, or a
 * payload its schema refuses.
 *
 * @internal
 */
export function parseBillingEvent(body: string): PolarWebhookEvent {
  const now = new Date()
  const headers = { 'webhook-id': 'parse', 'webhook-timestamp': String(Math.floor(now.getTime() / 1000)), 'webhook-signature': parseSigner.sign('parse', now, body) }
  return validateEvent(body, headers, PARSE_KEY) as PolarWebhookEvent
}

/** The provider component's own writes a delivery keeps in step (structural). */
export interface ProviderRecordRefs {
  createSubscription: FunctionReference<'mutation', 'internal', { subscription: Record<string, unknown> }, unknown>
  updateSubscription: FunctionReference<'mutation', 'internal', { subscription: Record<string, unknown> }, unknown>
  createProduct: FunctionReference<'mutation', 'internal', { product: Record<string, unknown> }, unknown>
  updateProduct: FunctionReference<'mutation', 'internal', { product: Record<string, unknown> }, unknown>
}

type DateLike = Date | null | undefined
const iso = (date: DateLike): string | null => date ? date.toISOString() : null

/* eslint-disable @typescript-eslint/no-explicit-any -- the SDK's parsed shapes, read field by field as the provider component stores them */

/** A subscription as the provider component's `subscriptions` table stores it. */
function subscriptionRecord(subscription: any): Record<string, unknown> {
  return {
    id: subscription.id,
    customerId: subscription.customerId,
    createdAt: subscription.createdAt.toISOString(),
    modifiedAt: iso(subscription.modifiedAt),
    productId: subscription.productId,
    checkoutId: subscription.checkoutId,
    amount: subscription.amount,
    currency: subscription.currency,
    recurringInterval: subscription.recurringInterval,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart.toISOString(),
    currentPeriodEnd: iso(subscription.currentPeriodEnd),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    customerCancellationReason: subscription.customerCancellationReason,
    customerCancellationComment: subscription.customerCancellationComment,
    startedAt: iso(subscription.startedAt),
    endedAt: iso(subscription.endedAt),
    metadata: subscription.metadata,
    discountId: subscription.discountId,
    canceledAt: iso(subscription.canceledAt),
    endsAt: iso(subscription.endsAt),
    recurringIntervalCount: subscription.recurringIntervalCount,
    trialStart: iso(subscription.trialStart),
    trialEnd: iso(subscription.trialEnd),
    seats: subscription.seats ?? null,
    customFieldData: subscription.customFieldData,
  }
}

/** One price as the provider component's `products` table stores it. */
function priceRecord(product: any, price: any): Record<string, unknown> {
  const base = {
    id: price.id,
    productId: price.productId,
    amountType: price.amountType,
    isArchived: price.isArchived,
    createdAt: price.createdAt.toISOString(),
    modifiedAt: iso(price.modifiedAt),
    recurringInterval: product.recurringInterval,
    type: product.isRecurring ? 'recurring' : 'one_time',
    source: price.source,
  }
  switch (price.amountType) {
    case 'fixed':
      return { ...base, priceAmount: price.priceAmount, priceCurrency: price.priceCurrency }
    case 'custom':
      return { ...base, priceCurrency: price.priceCurrency, minimumAmount: price.minimumAmount, maximumAmount: price.maximumAmount, presetAmount: price.presetAmount }
    case 'seat_based':
      return {
        ...base,
        priceCurrency: price.priceCurrency,
        seatTiers: price.seatTiers?.tiers.map((tier: any) => ({ minSeats: tier.minSeats, maxSeats: tier.maxSeats ?? null, pricePerSeat: tier.pricePerSeat })),
      }
    case 'metered_unit':
      // The SDK's meter also carries its unit and label, which the table's
      // validator refuses: the whole product would go unstored, and its
      // delivery fail on every retry.
      return { ...base, priceCurrency: price.priceCurrency, unitAmount: price.unitAmount, capAmount: price.capAmount, meterId: price.meterId, meter: price.meter && { id: price.meter.id, name: price.meter.name } }
    default:
      return base
  }
}

/** A product as the provider component's `products` table stores it. */
function productRecord(product: any): Record<string, unknown> {
  return {
    id: product.id,
    organizationId: product.organizationId,
    name: product.name,
    description: product.description,
    isRecurring: product.isRecurring,
    isArchived: product.isArchived,
    createdAt: product.createdAt.toISOString(),
    modifiedAt: iso(product.modifiedAt),
    recurringInterval: product.recurringInterval,
    metadata: product.metadata,
    trialInterval: product.trialInterval,
    trialIntervalCount: product.trialIntervalCount,
    recurringIntervalCount: product.recurringIntervalCount,
    prices: product.prices.map((price: any) => priceRecord(product, price)),
    benefits: product.benefits?.map((benefit: any) => ({
      id: benefit.id,
      createdAt: benefit.createdAt.toISOString(),
      modifiedAt: iso(benefit.modifiedAt),
      type: benefit.type,
      description: benefit.description,
      selectable: benefit.selectable,
      deletable: benefit.deletable,
      organizationId: benefit.organizationId,
      metadata: benefit.metadata,
      properties: benefit.properties,
    })),
    medias: product.medias.map((media: any) => ({
      id: media.id,
      organizationId: media.organizationId,
      name: media.name,
      path: media.path,
      mimeType: media.mimeType,
      size: media.size,
      storageVersion: media.storageVersion,
      checksumEtag: media.checksumEtag,
      checksumSha256Base64: media.checksumSha256Base64,
      checksumSha256Hex: media.checksumSha256Hex,
      createdAt: media.createdAt.toISOString(),
      lastModifiedAt: iso(media.lastModifiedAt),
      version: media.version,
      isUploaded: media.isUploaded,
      sizeReadable: media.sizeReadable,
      publicUrl: media.publicUrl,
    })),
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Keep the provider component's subscriptions and products in step with a
 * verified event, as its own route stores them: the reads `useBilling` and
 * pricing make come from those tables. Every other event writes nothing here.
 *
 * @internal
 */
export async function persistProviderRecord(ctx: RunWriteCtx, refs: ProviderRecordRefs, event: PolarWebhookEvent): Promise<void> {
  const data = (event as { data: unknown }).data
  switch (event.type) {
    case 'subscription.created':
      await ctx.runMutation(refs.createSubscription, { subscription: subscriptionRecord(data) })
      break
    case 'subscription.updated':
      await ctx.runMutation(refs.updateSubscription, { subscription: subscriptionRecord(data) })
      break
    case 'product.created':
      await ctx.runMutation(refs.createProduct, { product: productRecord(data) })
      break
    case 'product.updated':
      await ctx.runMutation(refs.updateProduct, { product: productRecord(data) })
      break
  }
}
