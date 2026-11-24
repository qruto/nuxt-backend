// The provider-neutral seam the commerce providers are built behind: one
// adapter per merchant of record (Stripe Managed Payments, Dodo Payments,
// Creem), each answering the same calls in the same neutral words, so the
// billing layer above them never reads a provider's own shapes. Polar keeps
// its component-backed path (context.ts); its adapter here covers the same
// calls so a provider can be swapped by configuration alone.
//
// Runtime-neutral: `fetch` and Web Crypto only, no Node built-ins and no SDK,
// so every adapter runs in the Convex isolate as well as under Node.

/** The merchants of record the package sells through. */
export type BillingProviderName = 'polar' | 'stripe' | 'dodo' | 'creem'

/** Every provider, in the order the docs list them. */
export const BILLING_PROVIDER_NAMES: readonly BillingProviderName[] = ['polar', 'stripe', 'dodo', 'creem']

/** The provider's environment: its sandbox (test mode) or production (live mode). */
export type ProviderEnvironment = 'sandbox' | 'production'

/** What one provider can do through its API, for the doctor, the docs and a refusal that names what is missing. */
export interface ProviderCapabilities {
  /** One-time purchases (a comic issue, a credit pack). */
  oneTime: boolean
  /** Renewing subscriptions. */
  subscriptions: boolean
  /** A hosted page where customers manage payment methods, invoices and cancellation. */
  customerPortal: boolean
  /** Moving a subscription to another product, with proration. */
  changePlan: boolean
  /** Cancelling at period end, and taking that back before it ends. */
  cancelAtPeriodEnd: boolean
  /** Taking a scheduled cancellation back through the API. */
  uncancel: boolean
  /** Pausing and resuming a subscription. */
  pause: boolean
  /** Refunding an order through the API (every provider refunds from its dashboard). */
  refundApi: boolean
  /** A link to, or the bytes of, an order's invoice or receipt. */
  invoices: boolean
  /** Discount or promotion codes at checkout. */
  discountCodes: boolean
  /** The provider signs the query it appends to the success URL, so the success page can trust its ids. */
  signedRedirect: boolean
  /** The provider sells as merchant of record: it is the seller, and files and remits sales tax and VAT. */
  merchantOfRecord: boolean
  /** The provider emails receipts and invoices itself. */
  sendsReceipts: boolean
}

/** A checkout's buyer, as the app knows them. */
export interface CheckoutCustomer {
  /** The billing entity id the order belongs to (the workspace or the user): stored on the provider as metadata and as the external reference. */
  entityId: string
  email?: string
  name?: string
  /** The provider's own customer id, once one exists: the checkout reuses it instead of making another. */
  providerCustomerId?: string
}

/** What a checkout sells. */
export interface CheckoutRequest {
  /** The provider's product id (Dodo, Creem, Polar) or price id (Stripe). */
  productId: string
  /** Whether the product renews: Stripe needs to know (`mode`), the others read it off the product. */
  kind: 'one_time' | 'subscription'
  quantity?: number
  customer: CheckoutCustomer
  /** Where the provider sends the buyer after paying. */
  successUrl: string
  /** Where it sends a buyer who leaves (Stripe, Dodo). */
  cancelUrl?: string
  /** A discount or promotion code the buyer entered. */
  discountCode?: string
  /** The checkout page's language, as a BCP 47 tag (Stripe). */
  locale?: string
  /** Free trial length in days, for a subscription (Stripe, Dodo). */
  trialDays?: number
  /**
   * Metadata carried through to the order, the subscription and their
   * events (refund and dispute events carry only the order's or the
   * subscription's id). The adapter adds `entity_id` and nothing else: to
   * keep the digital-content consent with the sale, record the buyer's
   * explicit acceptance with `recordDigitalContentConsent` and pass
   * `consentMetadata(...)` in here. Keys and values stay short: Stripe caps
   * a key at 40 characters and a value at 500.
   */
  metadata?: Record<string, string>
  /**
   * A key that makes a retried create return the first checkout instead of
   * a second one, on Stripe (`Idempotency-Key`) and Creem (`request_id`).
   * Dodo's checkout API takes none, so a retry there opens a second
   * checkout: harmless, as only a paid one becomes an order, but dedupe on
   * the `order.paid` event, never on the checkout.
   */
  idempotencyKey?: string
}

/** A created checkout: the page to send the buyer to. */
export interface CheckoutSession {
  id: string
  url: string
}

/** A subscription's status in neutral words. */
export type NeutralSubscriptionStatus
  = | 'trialing'
    | 'active'
    | 'past_due'
    | 'paused'
  /** Over: cancelled, expired or failed for good. One ending at period end stays `active` with `cancelAtPeriodEnd`. */
    | 'ended'
    | 'incomplete'

/** A subscription as every provider reports it, in the package's words. */
export interface NeutralSubscription {
  id: string
  customerId: string | null
  /** The billing entity id the checkout carried in its metadata, when it did. */
  entityId: string | null
  productId: string | null
  status: NeutralSubscriptionStatus
  /** Whether it ends at the end of the current period instead of renewing. */
  cancelAtPeriodEnd: boolean
  /** When the current period ends (and the next charge falls), in Unix milliseconds. */
  currentPeriodEnd: number | null
  metadata: Record<string, string>
}

/** An order (a one-time purchase or a subscription's charge) in neutral words. */
export interface NeutralOrder {
  id: string
  customerId: string | null
  entityId: string | null
  productId: string | null
  subscriptionId: string | null
  /** The amount charged in the currency's minor unit, tax included. */
  amount: number
  /** The tax in it, in the minor unit, when the provider reports it. */
  taxAmount: number | null
  /** ISO 4217, lowercase. */
  currency: string
  metadata: Record<string, string>
}

/** A refund in neutral words. */
export interface NeutralRefund {
  id: string
  orderId: string | null
  subscriptionId: string | null
  amount: number | null
  currency: string | null
  status: 'pending' | 'succeeded' | 'failed'
}

/**
 * A verified delivery, read into what it means for the app. A provider's
 * event that changes nothing the package keeps reads as `ignored`, with its
 * own type kept for the delivery log.
 */
export type NeutralBillingEvent
  = | { type: 'order.paid', order: NeutralOrder, providerType: string }
    | { type: 'order.refunded', refund: NeutralRefund, providerType: string }
    | { type: 'order.disputed', orderId: string | null, subscriptionId: string | null, providerType: string }
    | { type: 'subscription.updated', subscription: NeutralSubscription, providerType: string }
    | { type: 'ignored', providerType: string }

/** A verified delivery: its id (for the redelivery dedupe) and what it means. */
export interface VerifiedDelivery {
  id: string
  event: NeutralBillingEvent
}

/** Changing a subscription's product. */
export interface ChangePlanRequest {
  subscriptionId: string
  productId: string
  /**
   * Charge (or credit) the difference now, or move without billing until
   * the next renewal. Stripe refuses `next_period` for a change of billing
   * interval (monthly to yearly), which it would bill at once.
   */
  proration: 'immediately' | 'next_period'
  quantity?: number
}

/** Refunding an order, in full or in part. */
export interface RefundRequest {
  orderId: string
  /** In the minor unit; the whole order without one. */
  amount?: number
  reason?: string
  idempotencyKey?: string
}

/** Where a customer reads an order's invoice: a link, or the PDF itself (Dodo serves the bytes). */
export type InvoiceAnswer = { kind: 'url', url: string } | { kind: 'pdf', bytes: ArrayBuffer }

/** The calls every commerce provider answers. A call its API lacks throws {@link ProviderUnsupportedError}. */
export interface CommerceProvider {
  readonly name: BillingProviderName
  readonly environment: ProviderEnvironment
  readonly capabilities: ProviderCapabilities
  createCheckout: (request: CheckoutRequest) => Promise<CheckoutSession>
  /** The customer portal's link for one of the provider's customers. */
  customerPortalUrl: (providerCustomerId: string, options?: { returnUrl?: string }) => Promise<string>
  getSubscription: (subscriptionId: string) => Promise<NeutralSubscription>
  changePlan: (request: ChangePlanRequest) => Promise<void>
  /** Cancel now (`immediately`), or at the end of the period. */
  cancelSubscription: (subscriptionId: string, options?: { immediately?: boolean }) => Promise<void>
  /** Take a scheduled cancellation back. */
  uncancelSubscription: (subscriptionId: string) => Promise<void>
  /** Stop billing (and access) until resumed. */
  pauseSubscription: (subscriptionId: string) => Promise<void>
  resumeSubscription: (subscriptionId: string) => Promise<void>
  refundOrder: (request: RefundRequest) => Promise<NeutralRefund>
  invoice: (orderId: string) => Promise<InvoiceAnswer>
  /**
   * Whether the query the provider appended to the success URL is its own
   * (`capabilities.signedRedirect`; the others throw
   * `ProviderUnsupportedError`). It lets a success page trust the ids it
   * shows; access is still granted by `order.paid`, never by the redirect.
   */
  verifyCheckoutRedirect: (search: string | URLSearchParams) => Promise<boolean>
  /**
   * Verify a delivery against the accepted secrets (a rotation accept-list,
   * first entry primary) and read it. `null` when no secret verifies it:
   * the route answers 401 and reads nothing of the body.
   */
  verifyWebhook: (body: string, headers: Headers, secrets: readonly string[], now?: number) => Promise<VerifiedDelivery | null>
}

/**
 * A call a provider's API does not offer: the app shows the dashboard or the portal instead.
 *
 * @experimental
 */
export class ProviderUnsupportedError extends Error {
  override readonly name = 'ProviderUnsupportedError'
  readonly provider: BillingProviderName
  readonly operation: string
  constructor(provider: BillingProviderName, operation: string, hint: string) {
    super(`[nuxt-backend] ${provider} offers no API to ${operation}: ${hint}`)
    this.provider = provider
    this.operation = operation
  }
}

/**
 * A provider's HTTP answer that was not a success. `statusCode` is read by
 * provider-failure.ts to tell a provider having trouble (408, 429, 5xx) from
 * one refusing the request. The body is never kept: it echoes the request.
 *
 * @experimental
 */
export class ProviderHttpError extends Error {
  override readonly name = 'ProviderHttpError'
  readonly provider: BillingProviderName
  readonly operation: string
  readonly statusCode: number
  readonly code: string | undefined
  constructor(provider: BillingProviderName, operation: string, statusCode: number, code?: string) {
    super(`[nuxt-backend] ${provider} refused ${operation} (HTTP ${statusCode}${code ? `, ${code}` : ''}).`)
    this.provider = provider
    this.operation = operation
    this.statusCode = statusCode
    this.code = code
  }
}

/** What every adapter is built with. */
export interface ProviderOptions {
  /** The provider's secret API key (Stripe `sk_…`/`rk_…`, Dodo `dodo_…`, Creem `creem_…`). */
  apiKey: string
  environment: ProviderEnvironment
  /** A `fetch` to call the provider with: the global one by default, a fake in tests. */
  fetch?: typeof fetch
}
