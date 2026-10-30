import { randomBytes } from 'node:crypto'
import { customerByExternalId } from './api-customers'
import { type ApiContext, all, type Body, find, type Handler, idFor, managedKey, metadataOf, newestFirst, numberOf, paginate, reply, requiredText, type Route, strings, text, timeOf } from './api-kit'
import { invalid, notFound, refused } from './errors'
import { discountRefusal, isFreeProduct, priceOf } from './flows'
import { type CheckoutRecord, type DiscountRecord, type EventRecord, newId, type FakeState, type SubscriptionRecord } from './state'
import { discountAmounts } from './models'

// Money moving: checkouts (created by the server, updated and confirmed by
// their client secret), subscription changes, orders and their invoices,
// refunds, discounts, and usage events.

/** How long a checkout stays open. */
const CHECKOUT_MS = 60 * 60 * 1000

/** Statuses the provider bills: the ones a cancellation acts on. */
const BILLABLE_STATUSES = new Set(['active', 'trialing', 'past_due'])

/**
 * Whether the provider lets a subscription be canceled, its `can_cancel`:
 * revoked now while it has not ended (a paused one included), or set to
 * cancel at the period's end once, while it is billed.
 */
function canCancel(subscription: SubscriptionRecord, immediately: boolean): boolean {
  if (immediately && subscription.status === 'paused') return subscription.endedAt === null
  if (!BILLABLE_STATUSES.has(subscription.status) || subscription.endedAt !== null) return false
  return immediately || !(subscription.cancelAtPeriodEnd || subscription.endsAt !== null)
}

/** The discount a code names, among those not deleted, whatever its letter case. */
function discountByCode(state: FakeState, code: string): DiscountRecord | undefined {
  const wanted = code.toLowerCase()
  return Object.values(state.discounts).find(discount => !discount.deleted && discount.code?.toLowerCase() === wanted)
}

export function commerceRoutes(context: ApiContext): Route[] {
  const { state, models, flows, deliveries, now, baseUrl } = context

  /** Refuse a discount that can't apply to this checkout. */
  const checkDiscount = (discount: DiscountRecord, checkout: Pick<CheckoutRecord, 'productId' | 'customerId' | 'currency'>, field: string) => {
    const currency = checkout.currency ?? priceOf(find(state.products, checkout.productId, 'Product')).currency
    const refusal = discountRefusal(discount, { productId: checkout.productId, customerId: checkout.customerId, currency, now: now() })
    if (refusal) throw invalid(field, refusal)
  }

  /** The customer a checkout names, by id or external id; `null` when it names none yet. */
  const checkoutCustomerId = (body: Body): string | null => {
    const id = text(body, 'customer_id')
    if (id) return find(state.customers, id, 'Customer').id
    const externalId = text(body, 'external_customer_id')
    return externalId ? customerByExternalId(state, externalId)?.id ?? null : null
  }

  /** The subscription a checkout upgrades: only one on a free price, as the provider allows. */
  const upgradedSubscription = (id: string | null): string | null => {
    if (!id) return null
    const subscription = find(state.subscriptions, id, 'Subscription')
    const product = state.products[subscription.productId]
    if (!product || !isFreeProduct(product)) throw invalid('subscription_id', 'Only a subscription on a free price can be upgraded through a checkout.')
    return subscription.id
  }

  /** The presentment currency a checkout asks for, which every product of it must be priced in. */
  const checkoutCurrency = (body: Body, productIds: string[]): string | null => {
    const currency = text(body, 'currency')?.toLowerCase() ?? null
    if (currency === null) return null
    for (const id of productIds) {
      if (!state.products[id]!.prices.some(price => !price.isArchived && price.priceCurrency === currency)) {
        throw invalid('currency', `The product has no price in ${currency}.`)
      }
    }
    return currency
  }

  const createCheckout: Handler = ({ body }) => {
    const productIds = strings(body.products)
    if (productIds.length === 0) throw invalid('products', 'At least one product is required.')
    for (const id of productIds) {
      if (find(state.products, id, 'Product').isArchived) throw invalid('products', 'The product is archived.')
    }
    const currency = checkoutCurrency(body, productIds)
    const time = now()
    const id = newId()
    const checkout: CheckoutRecord = {
      id,
      clientSecret: `polar_c_${randomBytes(18).toString('base64url')}`,
      status: 'open',
      productIds,
      productId: productIds[0]!,
      customerId: checkoutCustomerId(body),
      externalCustomerId: text(body, 'external_customer_id'),
      customerEmail: text(body, 'customer_email'),
      customerName: text(body, 'customer_name'),
      discountId: null,
      allowDiscountCodes: body.allow_discount_codes !== false,
      allowTrial: body.allow_trial !== false,
      trialInterval: (text(body, 'trial_interval') ?? null) as CheckoutRecord['trialInterval'],
      trialIntervalCount: numberOf(body, 'trial_interval_count'),
      subscriptionId: upgradedSubscription(text(body, 'subscription_id')),
      successUrl: text(body, 'success_url') ?? `${baseUrl}/`,
      returnUrl: text(body, 'return_url'),
      embedOrigin: text(body, 'embed_origin'),
      locale: text(body, 'locale'),
      currency,
      requireBillingAddress: body.require_billing_address === true,
      isBusinessCustomer: body.is_business_customer === true,
      metadata: metadataOf(body.metadata),
      customFieldData: (body.custom_field_data ?? {}) as CheckoutRecord['customFieldData'],
      createdAt: time,
      modifiedAt: null,
      expiresAt: time + CHECKOUT_MS,
    }
    const discountId = text(body, 'discount_id')
    if (discountId) {
      checkDiscount(find(state.discounts, discountId, 'Discount'), checkout, 'discount_id')
      checkout.discountId = discountId
    }
    state.checkouts[id] = checkout
    deliveries.emit('checkout.created', models.checkout(checkout))
    return reply(201, 'checkout', models.checkout(checkout))
  }

  /** An open checkout by its client secret; an expired one is marked so and refused. */
  const openCheckout = (secret: string | undefined): CheckoutRecord => {
    const checkout = Object.values(state.checkouts).find(entry => entry.clientSecret === secret)
    if (!checkout) throw notFound('Checkout')
    if (checkout.status === 'open' && checkout.expiresAt <= now()) checkout.status = 'expired'
    if (checkout.status !== 'open') throw refused('NotOpenCheckout', `The checkout is ${checkout.status}.`)
    return checkout
  }

  const updateCheckout: Handler = ({ params, body }) => {
    const checkout = openCheckout(params.secret)
    const code = text(body, 'discount_code')
    if (code !== null) {
      if (!checkout.allowDiscountCodes) throw invalid('discount_code', 'Discount codes are not allowed on this checkout.')
      const discount = discountByCode(state, code)
      if (!discount) throw invalid('discount_code', 'Discount does not exist.')
      checkDiscount(discount, checkout, 'discount_code')
      checkout.discountId = discount.id
    }
    for (const [field, key] of [['customer_email', 'customerEmail'], ['customer_name', 'customerName'], ['locale', 'locale']] as const) {
      if (field in body) checkout[key] = text(body, field)
    }
    checkout.modifiedAt = now()
    deliveries.emit('checkout.updated', models.checkout(checkout))
    return reply(200, 'checkout-public', models.checkoutPublic(checkout))
  }

  /**
   * Confirm a checkout through its client secret: a free one (a 100%
   * discount, as a gift claim has) completes here; a paid one needs its card,
   * which the fake provider takes on the checkout page.
   */
  const confirmCheckout: Handler = ({ params }) => {
    const checkout = openCheckout(params.secret)
    if (models.checkoutAmounts(checkout).totalAmount > 0) {
      throw invalid('confirmation_token_id', 'A paid checkout is paid on its checkout page in the fake provider.')
    }
    flows.completeCheckout(checkout)
    return reply(200, 'checkout-confirmed', { ...models.checkoutPublic(checkout), status: 'confirmed', customerSessionToken: null })
  }

  /**
   * The cancel arm, with the provider's refusals: a subscription already set
   * to cancel can't be canceled again (its reason goes with the one
   * cancellation), and one that is not set to cancel can't be uncanceled
   * (a 409 the installed SDK reads as an unknown error, as it does the
   * provider's).
   */
  const applyCancellation = (subscription: SubscriptionRecord, cancel: boolean, churn: { reason: string | null, comment: string | null }) => {
    if (cancel && !canCancel(subscription, false)) {
      throw refused('AlreadyCanceledSubscription', 'This subscription is already canceled or will be at the end of the period.')
    }
    if (!cancel && !(subscription.cancelAtPeriodEnd && BILLABLE_STATUSES.has(subscription.status))) {
      throw refused('SubscriptionNotScheduledToCancel', 'This subscription is not scheduled to be canceled, so it cannot be uncanceled.', 409)
    }
    flows.setCancelAtPeriodEnd(subscription, cancel, churn)
  }

  /** Apply one arm of the provider's subscription update. */
  const applySubscriptionUpdate = (subscription: SubscriptionRecord, body: Body) => {
    const churn = { reason: text(body, 'customer_cancellation_reason'), comment: text(body, 'customer_cancellation_comment') }
    if (body.revoke === true) {
      if (!canCancel(subscription, true)) throw refused('AlreadyCanceledSubscription', 'This subscription is already canceled.')
      return flows.revokeSubscription(subscription, churn)
    }
    if (typeof body.cancel_at_period_end === 'boolean') return applyCancellation(subscription, body.cancel_at_period_end, churn)
    if ('discount_id' in body) {
      flows.setDiscount(subscription, text(body, 'discount_id'))
      if (!text(body, 'product_id')) return
    }
    if (text(body, 'product_id')) return flows.changePlan(subscription, text(body, 'product_id')!, text(body, 'proration_behavior'))
    if (typeof body.pause_at_period_end === 'boolean') return flows.setPaused(subscription, body.pause_at_period_end, timeOf(body, 'resumes_at'))
    if (body.resume === true) return flows.setPaused(subscription, false, null)
    if (body.trial_end === 'now') return flows.endTrial(subscription)
    // The current period moved: the next renewal falls on the date given.
    if (text(body, 'current_billing_period_end')) {
      const end = timeOf(body, 'current_billing_period_end')
      if (end === null || end <= now()) throw invalid('current_billing_period_end', 'The new end of the period must be in the future.')
      subscription.currentPeriodEnd = end
      subscription.modifiedAt = now()
      return deliveries.emit('subscription.updated', models.subscription(subscription))
    }
    if ('pending_update' in body && body.pending_update === null) {
      if (!subscription.pendingUpdate) throw invalid('pending_update', 'This subscription has no pending update to clear.')
      subscription.pendingUpdate = null
      subscription.modifiedAt = now()
      return deliveries.emit('subscription.updated', models.subscription(subscription))
    }
    throw invalid('subscription_update', 'The fake provider does not apply this subscription update.')
  }

  /**
   * A subscription made through the API: only to a free product (a paid one
   * goes through a checkout), for a customer by id or external id, and —
   * as the organization allows one subscription per customer — only for a
   * customer that holds none.
   */
  const createSubscription: Handler = ({ body }) => {
    const productRecord = find(state.products, requiredText(body, 'product_id'), 'Product')
    if (productRecord.isArchived || !isFreeProduct(productRecord)) {
      throw invalid('product_id', 'Only a free recurring product can be subscribed to without a checkout.')
    }
    const externalId = text(body, 'external_customer_id')
    const customer = externalId ? customerByExternalId(state, externalId) : find(state.customers, text(body, 'customer_id') ?? undefined, 'Customer')
    if (!customer) throw notFound('Customer')
    if (Object.values(state.subscriptions).some(entry => entry.customerId === customer.id && entry.endedAt === null && BILLABLE_STATUSES.has(entry.status))) {
      throw refused('AlreadyActiveSubscriptionError', 'The customer already has an active subscription.')
    }
    return reply(201, 'subscription', models.subscription(flows.startFreeSubscription(customer, productRecord, metadataOf(body.metadata))))
  }

  const updateSubscription: Handler = ({ params, body }) => {
    const subscription = find(state.subscriptions, params.id, 'Subscription')
    if (subscription.status === 'canceled' || subscription.endedAt !== null) {
      throw refused('AlreadyCanceledSubscription', 'This subscription is already canceled.')
    }
    applySubscriptionUpdate(subscription, body)
    return reply(200, 'subscription', models.subscription(subscription))
  }

  const listOrders: Handler = ({ query }) => {
    const externalIds = all(query, 'external_customer_id')
    const customerIds = new Set([
      ...all(query, 'customer_id'),
      ...externalIds.flatMap(externalId => customerByExternalId(state, externalId)?.id ?? []),
    ])
    const productId = query.get('product_id')
    const filtered = all(query, 'customer_id').length > 0 || externalIds.length > 0
    const items = newestFirst(Object.values(state.orders)).filter(order =>
      (!filtered || customerIds.has(order.customerId)) && (!productId || order.productId === productId))
    const page = paginate(items, query)
    return reply(200, 'orders', { ...page, items: page.items.map(models.order) })
  }

  /**
   * Ask for an order's invoice. The provider generates it asynchronously:
   * this call is accepted, and the invoice reads once it is there.
   */
  const generateInvoice: Handler = ({ params }) => {
    const order = find(state.orders, params.id, 'Order')
    if (!order.isInvoiceGenerated) {
      order.isInvoiceGenerated = true
      order.invoiceNumber = `SIM-${String(Object.values(state.orders).filter(entry => entry.isInvoiceGenerated).length).padStart(4, '0')}`
      order.modifiedAt = now()
      deliveries.emit('order.updated', models.order(order))
    }
    return { status: 202, body: {} }
  }

  const getInvoice: Handler = ({ params }) => {
    const order = find(state.orders, params.id, 'Order')
    if (!order.isInvoiceGenerated) throw notFound('Invoice')
    return reply(200, 'order-invoice', { url: `${baseUrl}/invoices/${order.id}` })
  }

  const createRefund: Handler = ({ body }) => {
    const order = find(state.orders, requiredText(body, 'order_id'), 'Order')
    const amount = numberOf(body, 'amount')
    if (amount === null) throw invalid('amount', 'Field required')
    const refund = flows.refundOrder(order, { amount, reason: text(body, 'reason') ?? 'other', revokeBenefits: body.revoke_benefits === true, metadata: metadataOf(body.metadata) })
    return reply(201, 'refund', models.refund(refund))
  }

  return [
    ['POST', '/v1/checkouts', createCheckout],
    ['PATCH', '/v1/checkouts/client/{secret}', updateCheckout],
    ['POST', '/v1/checkouts/client/{secret}/confirm', confirmCheckout],
    ['POST', '/v1/subscriptions', createSubscription],
    ['PATCH', '/v1/subscriptions/{id}', updateSubscription],
    ['GET', '/v1/subscriptions/{id}', ({ params }) => reply(200, 'subscription', models.subscription(find(state.subscriptions, params.id, 'Subscription')))],
    ['GET', '/v1/orders', listOrders],
    ['GET', '/v1/orders/{id}', ({ params }) => reply(200, 'order', models.order(find(state.orders, params.id, 'Order')))],
    ['POST', '/v1/orders/{id}/invoice', generateInvoice],
    ['GET', '/v1/orders/{id}/invoice', getInvoice],
    ['POST', '/v1/refunds', createRefund],
    ...discountRoutes(context),
    ...eventRoutes(context),
  ]
}

/** Discounts: codes and code-free ones, redemptions counted and capped. */
function discountRoutes({ state, models, now }: ApiContext): Route[] {
  /** A discount not deleted, or the provider's 404. */
  const live = (id: string | undefined): DiscountRecord => {
    const discount = find(state.discounts, id, 'Discount')
    if (discount.deleted) throw notFound('Discount')
    return discount
  }

  const refuseTakenCode = (code: string | null, id?: string) => {
    if (code && Object.values(state.discounts).some(discount => discount.id !== id && !discount.deleted && discount.code?.toLowerCase() === code.toLowerCase())) {
      throw invalid('code', 'A discount with this code already exists.')
    }
  }

  /** A percentage in basis points, 1 to 10000, or the provider's 422. */
  const basisPointsOf = (body: Body): number => {
    const basisPoints = numberOf(body, 'basis_points')
    if (basisPoints === null || basisPoints < 1 || basisPoints > 10_000) throw invalid('basis_points', 'Input should be between 1 and 10000.')
    return basisPoints
  }

  /** A fixed discount's amounts by currency: `amounts`, else the deprecated `amount` and `currency`. */
  const amountsOf = (body: Body): Record<string, number> => {
    const amounts = typeof body.amounts === 'object' && body.amounts !== null
      ? Object.fromEntries(Object.entries(body.amounts).filter(([, amount]) => typeof amount === 'number').map(([code, amount]) => [code.toLowerCase(), amount as number]))
      : numberOf(body, 'amount') === null ? {} : { [(text(body, 'currency') ?? 'usd').toLowerCase()]: numberOf(body, 'amount')! }
    if (Object.keys(amounts).length === 0 || Object.values(amounts).some(amount => amount <= 0)) throw invalid('amounts', 'At least one amount above zero is required.')
    return amounts
  }

  /** The per-customer limit of a body, which only a raw call sends: a whole number, or `null`. */
  const perCustomerOf = (body: Body): number | null => {
    const limit = numberOf(body, 'max_redemptions_per_customer')
    if (limit !== null && !(Number.isInteger(limit) && limit >= 1)) throw invalid('max_redemptions_per_customer', 'Input should be greater than or equal to 1.')
    return limit
  }

  const createDiscount: Handler = ({ body }) => {
    const type = body.type === 'fixed' ? 'fixed' : 'percentage'
    const code = text(body, 'code')
    refuseTakenCode(code)
    const duration = (text(body, 'duration') ?? 'once') as DiscountRecord['duration']
    const months = numberOf(body, 'duration_in_months')
    if (duration === 'repeating' && months === null) throw invalid('duration_in_months', 'Field required')
    const metadata = metadataOf(body.metadata)
    const discount: DiscountRecord = {
      // A managed discount has the same id on every machine: the sandbox entry of the generated map stays put.
      id: idFor('discount', managedKey(metadata), state.discounts),
      name: requiredText(body, 'name'),
      code,
      type,
      ...(type === 'percentage' ? { basisPoints: basisPointsOf(body) } : { amounts: amountsOf(body) }),
      duration,
      ...(duration === 'repeating' ? { durationInMonths: months! } : {}),
      maxRedemptions: numberOf(body, 'max_redemptions'),
      maxRedemptionsPerCustomer: perCustomerOf(body),
      redemptionsCount: 0,
      redeemedBy: [],
      productIds: strings(body.products).map(id => find(state.products, id, 'Product').id),
      startsAt: timeOf(body, 'starts_at'),
      endsAt: timeOf(body, 'ends_at'),
      deleted: false,
      metadata,
      createdAt: now(),
      modifiedAt: null,
    }
    state.discounts[discount.id] = discount
    return reply(201, 'discount', models.discount(discount))
  }

  const listDiscounts: Handler = ({ query }) => {
    const search = query.get('query')?.toLowerCase()
    const items = newestFirst(Object.values(state.discounts)).filter(discount =>
      !discount.deleted && (!search || `${discount.name} ${discount.code ?? ''}`.toLowerCase().includes(search)))
    const page = paginate(items, query)
    return reply(200, 'discounts', { ...page, items: page.items.map(models.discount) })
  }

  /** The type and duration a discount always keeps: the provider's refusals. */
  const refuseFixedTerms = (discount: DiscountRecord, body: Body) => {
    if ('type' in body && body.type !== null && body.type !== discount.type) throw invalid('type', 'Type cannot be changed.')
    if ('duration' in body && body.duration !== null && body.duration !== discount.duration) throw invalid('duration', 'Duration cannot be changed.')
  }

  /** The amount and months a body asks for, each under the field the provider names it by. */
  const termsAsked = (discount: DiscountRecord, body: Body): Array<[field: string, change: Partial<DiscountRecord>]> => {
    const asked = (field: string) => field in body && body[field] !== null
    return [
      ...(asked('basis_points') && discount.type === 'percentage' ? [['basis_points', { basisPoints: basisPointsOf(body) }] as [string, Partial<DiscountRecord>]] : []),
      ...(asked('amounts') && discount.type === 'fixed' ? [['amounts', { amounts: amountsOf(body) }] as [string, Partial<DiscountRecord>]] : []),
      ...(asked('duration_in_months') && discount.duration === 'repeating' ? [['duration_in_months', { durationInMonths: numberOf(body, 'duration_in_months') ?? discount.durationInMonths }] as [string, Partial<DiscountRecord>]] : []),
    ]
  }

  /**
   * The terms a discount keeps: its type and duration always, and its
   * amount and months once anyone redeemed it — the provider's refusals.
   */
  const updateTerms = (discount: DiscountRecord, body: Body) => {
    refuseFixedTerms(discount, body)
    const current: Partial<DiscountRecord> = { basisPoints: discount.basisPoints, amounts: discountAmounts(discount), durationInMonths: discount.durationInMonths }
    const changed = termsAsked(discount, body).filter(([, change]) => Object.entries(change).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key as keyof DiscountRecord])))
    if (changed.length > 0 && discount.redemptionsCount > 0) throw invalid(changed[0]![0], 'This field cannot be changed once the discount has been redeemed.')
    for (const [, change] of changed) Object.assign(discount, change)
  }

  const updateDiscount: Handler = ({ params, body }) => {
    const discount = live(params.id)
    updateTerms(discount, body)
    if ('max_redemptions_per_customer' in body) discount.maxRedemptionsPerCustomer = perCustomerOf(body)
    if ('code' in body) {
      refuseTakenCode(text(body, 'code'), discount.id)
      discount.code = text(body, 'code')
    }
    if ('name' in body) discount.name = text(body, 'name') ?? discount.name
    if ('starts_at' in body) discount.startsAt = timeOf(body, 'starts_at')
    if ('ends_at' in body) discount.endsAt = timeOf(body, 'ends_at')
    if ('max_redemptions' in body) discount.maxRedemptions = numberOf(body, 'max_redemptions')
    if ('metadata' in body) discount.metadata = metadataOf(body.metadata)
    if (Array.isArray(body.products)) discount.productIds = strings(body.products)
    discount.modifiedAt = now()
    return reply(200, 'discount', models.discount(discount))
  }

  const deleteDiscount: Handler = ({ params }) => {
    const discount = live(params.id)
    discount.deleted = true
    discount.modifiedAt = now()
    return { status: 204 }
  }

  return [
    ['POST', '/v1/discounts', createDiscount],
    ['GET', '/v1/discounts', listDiscounts],
    ['GET', '/v1/discounts/{id}', ({ params }) => reply(200, 'discount', models.discount(live(params.id)))],
    ['PATCH', '/v1/discounts/{id}', updateDiscount],
    ['DELETE', '/v1/discounts/{id}', deleteDiscount],
  ]
}

/** Usage events: ingested once per external id, listed by customer, meter and time. */
function eventRoutes({ state, models, now }: ApiContext): Route[] {
  const ingest: Handler = ({ body }) => {
    if (!Array.isArray(body.events)) throw invalid('events', 'Field required')
    let inserted = 0
    let duplicates = 0
    for (const entry of body.events as Body[]) {
      const externalId = text(entry, 'external_id')
      if (externalId && state.events.some(event => event.externalId === externalId)) {
        duplicates += 1
        continue
      }
      const externalCustomerId = text(entry, 'external_customer_id')
      const event: EventRecord = {
        id: newId(),
        name: requiredText(entry, 'name'),
        customerId: text(entry, 'customer_id') ?? (externalCustomerId ? customerByExternalId(state, externalCustomerId)?.id ?? null : null),
        externalCustomerId,
        externalId,
        metadata: metadataOf(entry.metadata),
        timestamp: timeOf(entry, 'timestamp') ?? now(),
      }
      state.events.push(event)
      inserted += 1
    }
    return reply(200, 'events-ingested', { inserted, duplicates })
  }

  const list: Handler = ({ query }) => {
    const customerIds = all(query, 'customer_id')
    const externalIds = all(query, 'external_customer_id')
    const meter = query.get('meter_id') ? find(state.meters, query.get('meter_id')!, 'Meter') : null
    const start = query.get('start_timestamp') ? Date.parse(query.get('start_timestamp')!) : Number.NEGATIVE_INFINITY
    const end = query.get('end_timestamp') ? Date.parse(query.get('end_timestamp')!) : Number.POSITIVE_INFINITY
    const items = state.events
      .filter(event =>
        (customerIds.length === 0 || (event.customerId !== null && customerIds.includes(event.customerId)))
        && (externalIds.length === 0 || (event.externalCustomerId !== null && externalIds.includes(event.externalCustomerId)))
        && (!meter || event.name === meter.eventName)
        && event.timestamp >= start && event.timestamp <= end)
      .sort((a, b) => b.timestamp - a.timestamp)
    const page = paginate(items, query)
    return reply(200, 'events', { ...page, items: page.items.map(models.userEvent) })
  }

  return [
    ['POST', '/v1/events/ingest', ingest],
    ['GET', '/v1/events', list],
  ]
}
