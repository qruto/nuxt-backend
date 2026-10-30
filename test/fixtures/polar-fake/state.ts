import { createHash, randomBytes, randomUUID } from 'node:crypto'

// The fake provider's whole state: plain JSON records, times as epoch
// milliseconds, held in memory. The provider SDK's own types and schemas
// shape what the API answers (models.ts); these records are only what that
// is built from.

export type Metadata = Record<string, string | number | boolean>

export interface PriceRecord {
  id: string
  amountType: 'fixed' | 'metered_unit'
  priceCurrency: string
  priceAmount?: number
  meterId?: string
  unitAmount?: string
  capAmount?: number | null
  taxBehavior: 'location' | 'inclusive' | 'exclusive' | null
  isArchived: boolean
  createdAt: number
}

export interface ProductRecord {
  id: string
  name: string
  description: string | null
  recurringInterval: 'day' | 'week' | 'month' | 'year' | null
  recurringIntervalCount: number | null
  trialInterval: 'day' | 'week' | 'month' | 'year' | null
  trialIntervalCount: number | null
  visibility: 'draft' | 'private' | 'public'
  isArchived: boolean
  metadata: Metadata
  prices: PriceRecord[]
  benefitIds: string[]
  customFields: Array<{ customFieldId: string, required: boolean }>
  createdAt: number
  modifiedAt: number | null
}

export interface BenefitRecord {
  id: string
  type: 'meter_credit' | 'feature_flag' | 'custom' | 'license_keys' | 'downloadables' | 'discord' | 'github_repository'
  description: string
  metadata: Metadata
  /**
   * `meter_credit`: units, rollover, meterId; `custom`: note;
   * `license_keys`: the keys' prefix; `downloadables`: file ids;
   * `discord`: the server and role; `github_repository`: the repository
   * and the permission it grants.
   */
  properties: {
    units?: number
    rollover?: boolean
    meterId?: string
    note?: string | null
    prefix?: string | null
    files?: string[]
    guildId?: string
    roleId?: string
    repositoryOwner?: string
    repositoryName?: string
    permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
  }
  createdAt: number
  modifiedAt: number | null
}

export interface MeterRecord {
  id: string
  name: string
  /** The event name the meter's filter selects. */
  eventName: string
  aggregation: { func: 'count' } | { func: 'sum', property: string }
  metadata: Metadata
  createdAt: number
}

export interface CustomFieldRecord {
  id: string
  type: 'text' | 'number' | 'date' | 'checkbox' | 'select'
  slug: string
  name: string
  options?: Array<{ value: string, label: string }>
  metadata: Metadata
  createdAt: number
}

export interface CustomerRecord {
  id: string
  type: 'individual' | 'team'
  email: string | null
  name: string | null
  externalId: string | null
  metadata: Metadata
  createdAt: number
  modifiedAt: number | null
  /** When it was deleted (`DELETE /v1/customers/external/{id}`): it reads as gone from then on. Absent in a state saved before deletion. */
  deletedAt?: number | null
}

export interface MemberRecord {
  id: string
  customerId: string
  email: string
  name: string | null
  externalId: string | null
  role: 'owner' | 'billing_manager' | 'member'
  createdAt: number
}

export interface SessionRecord {
  id: string
  token: string
  customerId: string
  memberId: string | null
  returnUrl: string | null
  createdAt: number
  expiresAt: number
}

export interface CheckoutRecord {
  id: string
  clientSecret: string
  status: 'open' | 'expired' | 'confirmed' | 'succeeded' | 'failed'
  productIds: string[]
  productId: string
  customerId: string | null
  externalCustomerId: string | null
  customerEmail: string | null
  customerName: string | null
  discountId: string | null
  allowDiscountCodes: boolean
  allowTrial: boolean
  trialInterval: ProductRecord['trialInterval']
  trialIntervalCount: number | null
  subscriptionId: string | null
  successUrl: string
  returnUrl: string | null
  embedOrigin: string | null
  locale: string | null
  /** The presentment currency the checkout charges in; `null` for the product's first (the organization's default). */
  currency?: string | null
  requireBillingAddress: boolean
  isBusinessCustomer: boolean
  metadata: Metadata
  customFieldData: Record<string, string | number | boolean | null>
  createdAt: number
  modifiedAt: number | null
  expiresAt: number
}

export interface SubscriptionRecord {
  id: string
  customerId: string
  productId: string
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'
  amount: number
  currency: string
  recurringInterval: 'day' | 'week' | 'month' | 'year'
  recurringIntervalCount: number
  currentPeriodStart: number
  currentPeriodEnd: number
  trialStart: number | null
  trialEnd: number | null
  cancelAtPeriodEnd: boolean
  canceledAt: number | null
  startedAt: number
  endsAt: number | null
  endedAt: number | null
  pauseAtPeriodEnd: boolean
  pausedAt: number | null
  resumesAt: number | null
  discountId: string | null
  /** When its discount first took money off a payment: a `repeating` one counts its months from then. */
  discountAppliedAt?: number | null
  checkoutId: string | null
  customerCancellationReason: string | null
  customerCancellationComment: string | null
  pendingUpdate: { id: string, productId: string, appliesAt: number, createdAt: number } | null
  metadata: Metadata
  createdAt: number
  modifiedAt: number | null
}

export interface OrderRecord {
  id: string
  customerId: string
  productId: string
  subscriptionId: string | null
  checkoutId: string | null
  discountId: string | null
  status: 'paid' | 'refunded' | 'partially_refunded'
  billingReason: 'purchase' | 'subscription_create' | 'subscription_cycle' | 'subscription_update'
  subtotalAmount: number
  discountAmount: number
  refundedAmount: number
  currency: string
  label: string
  isInvoiceGenerated: boolean
  invoiceNumber: string | null
  metadata: Metadata
  customFieldData: Record<string, string | number | boolean | null>
  createdAt: number
  modifiedAt: number | null
}

export interface RefundRecord {
  id: string
  orderId: string
  subscriptionId: string | null
  customerId: string
  amount: number
  currency: string
  reason: string
  revokeBenefits: boolean
  metadata: Metadata
  createdAt: number
}

export interface DiscountRecord {
  id: string
  name: string
  code: string | null
  type: 'percentage' | 'fixed'
  basisPoints?: number
  /** A fixed discount's amount off per currency: lower-case ISO 4217 code → cents. */
  amounts?: Record<string, number>
  /** A fixed discount's amount and currency, as states saved before `amounts` hold them. */
  amount?: number
  currency?: string
  duration: 'once' | 'forever' | 'repeating'
  durationInMonths?: number
  maxRedemptions: number | null
  /** How many times one customer may redeem it (the API's `max_redemptions_per_customer`); none when unset. */
  maxRedemptionsPerCustomer?: number | null
  redemptionsCount: number
  /** The customer of each redemption, once per redemption. */
  redeemedBy: string[]
  productIds: string[]
  startsAt: number | null
  endsAt: number | null
  deleted: boolean
  metadata: Metadata
  createdAt: number
  modifiedAt: number | null
}

export interface GrantRecord {
  id: string
  benefitId: string
  /** A license-key grant's key, generated when it is granted. */
  licenseKey?: { id: string, key: string }
  customerId: string
  subscriptionId: string | null
  orderId: string | null
  grantedAt: number
  revokedAt: number | null
  createdAt: number
  modifiedAt: number | null
}

/** A customer's balance on one meter: what was credited, counted from `resetAt`. */
export interface CustomerMeterRecord {
  id: string
  customerId: string
  meterId: string
  credited: number
  /** Usage before this time no longer counts: a cycle without rollover started over. */
  resetAt: number | null
  createdAt: number
  modifiedAt: number | null
}

export interface EventRecord {
  id: string
  name: string
  customerId: string | null
  externalCustomerId: string | null
  externalId: string | null
  metadata: Record<string, string | number | boolean>
  timestamp: number
}

/** The organization settings an update changed, camel-cased: merged over the fake's defaults. */
export interface OrganizationSettings {
  subscriptionSettings?: Record<string, unknown>
  customerEmailSettings?: Record<string, unknown>
}

export interface EndpointRecord {
  id: string
  url: string
  secret: string
  format: 'raw' | 'discord' | 'slack'
  events: string[]
  enabled: boolean
  createdAt: number
}

/** One delivery attempt, as the home page lists it. */
export interface DeliveryRecord {
  id: string
  type: string
  url: string
  status: number | null
  error?: string
  attempts: number
  at: number
}

export interface FakeState {
  version: 1
  organization: { id: string, name: string, slug: string, createdAt: number, settings?: OrganizationSettings }
  /** The secret it signs webhooks with unless the app names its own. */
  webhookSecret: string
  products: Record<string, ProductRecord>
  benefits: Record<string, BenefitRecord>
  meters: Record<string, MeterRecord>
  customFields: Record<string, CustomFieldRecord>
  customers: Record<string, CustomerRecord>
  members: Record<string, MemberRecord>
  sessions: Record<string, SessionRecord>
  checkouts: Record<string, CheckoutRecord>
  subscriptions: Record<string, SubscriptionRecord>
  orders: Record<string, OrderRecord>
  refunds: Record<string, RefundRecord>
  discounts: Record<string, DiscountRecord>
  grants: Record<string, GrantRecord>
  customerMeters: Record<string, CustomerMeterRecord>
  events: EventRecord[]
  endpoints: Record<string, EndpointRecord>
  deliveries: DeliveryRecord[]
  /** Scopes the access token lacks, so the routes that need one refuse it (`metrics:read`): none by default. */
  deniedScopes?: string[]
}

/**
 * An id the same on every machine for the same catalog key: a managed
 * product, meter or benefit gets one, so the entry `billing sync`
 * writes into `billing.generated.ts` does not change between developers.
 * Shaped as a UUID, as the provider's ids are.
 */
export function stableId(kind: string, key: string): string {
  const hex = createHash('sha256').update(`polar-fake:${kind}:${key}`).digest('hex')
  const variant = (8 | (Number.parseInt(hex[16]!, 16) & 3)).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** A fresh id for anything no catalog key names. */
export function newId(): string {
  return randomUUID()
}

/** A Standard Webhooks secret: `whsec_` and 24 random bytes in base64. */
export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64')}`
}

/** An empty fake: one organization, nothing else. */
export function emptyState(now = Date.now()): FakeState {
  return {
    version: 1,
    organization: { id: stableId('organization', 'default'), name: 'Fake organization', slug: 'fake', createdAt: now },
    webhookSecret: newWebhookSecret(),
    products: {},
    benefits: {},
    meters: {},
    customFields: {},
    customers: {},
    members: {},
    sessions: {},
    checkouts: {},
    subscriptions: {},
    orders: {},
    refunds: {},
    discounts: {},
    grants: {},
    customerMeters: {},
    events: [],
    endpoints: {},
    deliveries: [],
  }
}
