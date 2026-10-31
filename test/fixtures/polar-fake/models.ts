import type { Benefit } from '@polar-sh/sdk/models/components/benefit.js'
import type { BenefitGrantWebhook } from '@polar-sh/sdk/models/components/benefitgrantwebhook.js'
import type { Checkout } from '@polar-sh/sdk/models/components/checkout.js'
import type { CheckoutProduct } from '@polar-sh/sdk/models/components/checkoutproduct.js'
import type { CheckoutPublic } from '@polar-sh/sdk/models/components/checkoutpublic.js'
import type { CustomField } from '@polar-sh/sdk/models/components/customfield.js'
import type { Customer } from '@polar-sh/sdk/models/components/customer.js'
import type { CustomerSession } from '@polar-sh/sdk/models/components/customersession.js'
import type { CustomerState } from '@polar-sh/sdk/models/components/customerstate.js'
import type { Discount } from '@polar-sh/sdk/models/components/discount.js'
import type { DiscountProduct } from '@polar-sh/sdk/models/components/discountproduct.js'
import type { Member } from '@polar-sh/sdk/models/components/member.js'
import type { Meter } from '@polar-sh/sdk/models/components/meter.js'
import type { Order } from '@polar-sh/sdk/models/components/order.js'
import type { Organization } from '@polar-sh/sdk/models/components/organization.js'
import type { Product } from '@polar-sh/sdk/models/components/product.js'
import type { ProductPrice } from '@polar-sh/sdk/models/components/productprice.js'
import type { Refund } from '@polar-sh/sdk/models/components/refund.js'
import type { Subscription } from '@polar-sh/sdk/models/components/subscription.js'
import type { UserEvent } from '@polar-sh/sdk/models/components/userevent.js'
import type { WebhookEndpoint } from '@polar-sh/sdk/models/components/webhookendpoint.js'
import { activeGrants, customerMeterBalance, displayKey, orderAmounts } from './ledger'
import type {
  BenefitRecord, CheckoutRecord, CustomerRecord, CustomFieldRecord, DiscountRecord, EventRecord, GrantRecord, MemberRecord,
  MeterRecord, OrderRecord, PriceRecord, ProductRecord, RefundRecord, SessionRecord, FakeState, SubscriptionRecord,
} from './state'

// Fake records as the provider SDK types them. Every builder returns
// the SDK's own model type, so the compiler holds each shape complete; the
// API serializes them with the SDK's outbound schemas (api.ts), and the SDK
// parses them back with its response schemas: the drift check.

const date = (time: number) => new Date(time)
const optionalDate = (time: number | null | undefined) => (time == null ? null : new Date(time))

/** Builds the SDK models of one fake: its state, and the origin its pages are served at. */
export function createModels(state: FakeState, baseUrl: string) {
  const organizationId = state.organization.id

  const price = (record: PriceRecord, productId: string): ProductPrice => {
    const base = {
      id: record.id,
      createdAt: date(record.createdAt),
      modifiedAt: null,
      source: 'catalog' as const,
      priceCurrency: record.priceCurrency,
      taxBehavior: record.taxBehavior,
      isArchived: record.isArchived,
      productId,
    }
    if (record.amountType === 'metered_unit') {
      const meter = state.meters[record.meterId ?? '']
      return {
        ...base,
        amountType: 'metered_unit',
        unitAmount: record.unitAmount ?? '0',
        capAmount: record.capAmount ?? null,
        meterId: record.meterId ?? '',
        meter: { id: record.meterId ?? '', name: meter?.name ?? 'meter', unit: 'scalar', customLabel: null, customMultiplier: null },
      }
    }
    return { ...base, amountType: 'fixed', priceAmount: record.priceAmount ?? 0 }
  }

  /** The fields every product shape shares. */
  const productBase = (record: ProductRecord) => ({
    id: record.id,
    createdAt: date(record.createdAt),
    modifiedAt: optionalDate(record.modifiedAt),
    trialInterval: record.trialInterval,
    trialIntervalCount: record.trialIntervalCount,
    name: record.name,
    description: record.description,
    visibility: record.visibility,
    recurringInterval: record.recurringInterval,
    recurringIntervalCount: record.recurringIntervalCount,
    meterInterval: null,
    meterIntervalCount: null,
    isRecurring: record.recurringInterval !== null,
    isArchived: record.isArchived,
    organizationId,
  })

  const livePrices = (record: ProductRecord) => record.prices.filter(entry => !entry.isArchived).map(entry => price(entry, record.id))

  const benefit = (record: BenefitRecord): Benefit => {
    const base = {
      id: record.id,
      createdAt: date(record.createdAt),
      modifiedAt: optionalDate(record.modifiedAt),
      description: record.description,
      selectable: true,
      deletable: true,
      isDeleted: false,
      organizationId,
      metadata: record.metadata,
      visibility: 'public' as const,
      visibilityConfigurable: true,
    }
    const properties = record.properties
    switch (record.type) {
      case 'meter_credit':
        return { ...base, type: 'meter_credit', properties: { units: properties.units ?? 0, rollover: properties.rollover ?? false, meterId: properties.meterId ?? '' } }
      case 'feature_flag':
        return { ...base, type: 'feature_flag', properties: {} }
      case 'license_keys':
        return { ...base, type: 'license_keys', properties: { prefix: properties.prefix ?? null, expires: null, activations: null, limitUsage: null } }
      case 'downloadables':
        return { ...base, type: 'downloadables', properties: { archived: {}, files: properties.files ?? [] } }
      case 'discord':
        // The bot's token for the server is the provider's own: the fake provider has none.
        return { ...base, type: 'discord', properties: { guildId: properties.guildId ?? '', roleId: properties.roleId ?? '', kickMember: false, guildToken: '' } }
      case 'github_repository':
        return { ...base, type: 'github_repository', properties: { repositoryOwner: properties.repositoryOwner ?? '', repositoryName: properties.repositoryName ?? '', permission: properties.permission ?? 'pull' } }
      default:
        return { ...base, type: 'custom', properties: { note: properties.note ?? null } }
    }
  }

  /**
   * What a grant holds, as customer state and the grant's webhook list it:
   * a license key's ids and display key, the files of a download, the
   * server and role of a community, the repository and permission of a
   * repository grant; nothing for the rest. No account is connected in the
   * fake provider, so none is named.
   */
  const grantProperties = (record: GrantRecord, benefitRecord: BenefitRecord) => {
    const properties = benefitRecord.properties
    switch (benefitRecord.type) {
      case 'license_keys':
        return record.licenseKey ? { licenseKeyId: record.licenseKey.id, displayKey: displayKey(record.licenseKey.key) } : {}
      case 'downloadables':
        return { files: properties.files ?? [] }
      case 'discord':
        return { guildId: properties.guildId, roleId: properties.roleId }
      case 'github_repository':
        return { repositoryOwner: properties.repositoryOwner, repositoryName: properties.repositoryName, permission: properties.permission ?? 'pull' }
      default:
        return {}
    }
  }

  const benefitsOf = (record: ProductRecord) => record.benefitIds.flatMap(id => state.benefits[id] ? [benefit(state.benefits[id])] : [])

  /** A custom field: only a select has properties to show, its options. */
  const customField = (record: CustomFieldRecord): CustomField => ({
    id: record.id,
    createdAt: date(record.createdAt),
    modifiedAt: null,
    metadata: record.metadata,
    slug: record.slug,
    name: record.name,
    organizationId,
    type: record.type,
    properties: record.type === 'select' ? { options: record.options ?? [] } : {},
  }) as CustomField

  const attachedCustomFields = (record: ProductRecord) => record.customFields.flatMap((field, order) => {
    const found = state.customFields[field.customFieldId]
    return found ? [{ customFieldId: found.id, customField: customField(found), order, required: field.required }] : []
  })

  const product = (record: ProductRecord): Product => ({
    ...productBase(record),
    metadata: record.metadata,
    prices: livePrices(record),
    benefits: benefitsOf(record),
    medias: [],
    attachedCustomFields: attachedCustomFields(record),
  })

  const checkoutProduct = (record: ProductRecord): CheckoutProduct => ({
    ...productBase(record),
    prices: livePrices(record),
    benefits: benefitsOf(record).map(({ id, createdAt, modifiedAt, type, description, selectable, deletable, isDeleted }) =>
      ({ id, createdAt, modifiedAt, type, description, selectable, deletable, isDeleted, organizationId })),
    medias: [],
  })

  /** The fields every customer shape shares. */
  const customerBase = (record: CustomerRecord) => ({
    id: record.id,
    createdAt: date(record.createdAt),
    modifiedAt: optionalDate(record.modifiedAt),
    metadata: record.metadata,
    externalId: record.externalId,
    emailVerified: false,
    name: record.name,
    billingName: null,
    billingAddress: null,
    taxId: null,
    locale: null,
    organizationId,
    defaultPaymentMethodId: null,
    deletedAt: optionalDate(record.deletedAt ?? null),
    avatarUrl: null,
  })

  const customer = (record: CustomerRecord): Customer => record.type === 'team'
    ? { ...customerBase(record), type: 'team', email: record.email }
    : { ...customerBase(record), type: 'individual', email: record.email ?? '' }

  const subordinateCustomer = (record: CustomerRecord) => ({ ...customerBase(record), type: record.type, email: record.email })

  const member = (record: MemberRecord): Member => ({
    id: record.id,
    createdAt: date(record.createdAt),
    modifiedAt: null,
    customerId: record.customerId,
    email: record.email,
    name: record.name,
    externalId: record.externalId,
    role: record.role,
  })

  const meter = (record: MeterRecord): Meter => ({
    id: record.id,
    createdAt: date(record.createdAt),
    modifiedAt: null,
    metadata: record.metadata,
    name: record.name,
    unit: 'scalar',
    filter: { conjunction: 'and', clauses: [{ property: 'name', operator: 'eq', value: record.eventName }] },
    aggregation: record.aggregation,
    organizationId,
    archivedAt: null,
  })

  const discountProduct = (record: ProductRecord): DiscountProduct => ({ ...productBase(record), metadata: record.metadata })

  /** The fields every discount shape shares, in the shape the type and duration pick. */
  const discountFields = (record: DiscountRecord) => {
    const fixed = discountAmounts(record)
    const [currency, amount] = Object.entries(fixed)[0] ?? ['usd', 0]
    const amounts = record.type === 'fixed'
      ? { type: 'fixed' as const, amount, currency, amounts: fixed }
      : { type: 'percentage' as const, basisPoints: record.basisPoints ?? 0 }
    const duration = record.duration === 'repeating'
      ? { duration: 'repeating' as const, durationInMonths: record.durationInMonths ?? 1 }
      : { duration: record.duration }
    return { ...amounts, ...duration, id: record.id, name: record.name, code: record.code }
  }

  /**
   * A discount as the API answers it, with the per-customer limit the live
   * API has and the installed SDK does not: its schemas strip the field,
   * and the CLI's raw call reads it.
   */
  const discount = (record: DiscountRecord): Discount & { maxRedemptionsPerCustomer: number | null } => ({
    ...discountFields(record),
    createdAt: date(record.createdAt),
    modifiedAt: optionalDate(record.modifiedAt),
    metadata: record.metadata,
    startsAt: optionalDate(record.startsAt),
    endsAt: optionalDate(record.endsAt),
    maxRedemptions: record.maxRedemptions,
    maxRedemptionsPerCustomer: record.maxRedemptionsPerCustomer ?? null,
    redemptionsCount: record.redemptionsCount,
    organizationId,
    products: record.productIds.flatMap(id => state.products[id] ? [discountProduct(state.products[id])] : []),
  }) as Discount & { maxRedemptionsPerCustomer: number | null }

  const discountBase = (record: DiscountRecord | undefined) => {
    if (!record) return null
    const { products: _products, maxRedemptionsPerCustomer: _limit, ...base } = discount(record) as Discount & { products: unknown, maxRedemptionsPerCustomer: unknown }
    return base as Exclude<Subscription['discount'], null>
  }

  const subscriptionFields = (record: SubscriptionRecord) => ({
    id: record.id,
    createdAt: date(record.createdAt),
    modifiedAt: optionalDate(record.modifiedAt),
    metadata: record.metadata,
    amount: record.amount,
    currency: record.currency,
    recurringInterval: record.recurringInterval,
    recurringIntervalCount: record.recurringIntervalCount,
    status: record.status,
    currentPeriodStart: date(record.currentPeriodStart),
    currentPeriodEnd: date(record.currentPeriodEnd),
    currentMeterPeriodStart: null,
    currentMeterPeriodEnd: null,
    trialStart: optionalDate(record.trialStart),
    trialEnd: optionalDate(record.trialEnd),
    cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    canceledAt: optionalDate(record.canceledAt),
    startedAt: date(record.startedAt),
    endsAt: optionalDate(record.endsAt),
    endedAt: optionalDate(record.endedAt),
    pastDueAt: null,
    pauseAtPeriodEnd: record.pauseAtPeriodEnd,
    pausedAt: optionalDate(record.pausedAt),
    resumesAt: optionalDate(record.resumesAt),
    customerId: record.customerId,
    productId: record.productId,
    discountId: record.discountId,
    checkoutId: record.checkoutId,
    seats: null,
    customerCancellationReason: record.customerCancellationReason as Subscription['customerCancellationReason'],
    customerCancellationComment: record.customerCancellationComment,
  })

  /** The meters a subscription's product credits or prices, with the customer's usage. */
  const subscriptionMeters = (record: SubscriptionRecord) => {
    const productRecord = state.products[record.productId]
    const meterIds = new Set([
      ...(productRecord?.benefitIds ?? []).map(id => state.benefits[id]?.properties.meterId).filter((id): id is string => Boolean(id)),
      ...(productRecord?.prices ?? []).map(entry => entry.meterId).filter((id): id is string => Boolean(id)),
    ])
    return [...meterIds].flatMap((meterId) => {
      const meterRecord = state.meters[meterId]
      if (!meterRecord) return []
      const balance = customerMeterBalance(state, record.customerId, meterId)
      return [{ id: `${record.id}:${meterId}`, createdAt: date(record.createdAt), modifiedAt: null, consumedUnits: balance.consumed, creditedUnits: balance.credited, amount: 0, meterId, meterRecord }]
    })
  }

  const subscription = (record: SubscriptionRecord): Subscription => {
    const productRecord = state.products[record.productId]!
    return {
      ...subscriptionFields(record),
      customer: subordinateCustomer(state.customers[record.customerId]!),
      product: product(productRecord),
      discount: discountBase(state.discounts[record.discountId ?? '']),
      prices: livePrices(productRecord),
      meters: subscriptionMeters(record).map(({ meterRecord, ...entry }) => ({ ...entry, meter: meter(meterRecord) })),
      pendingUpdate: record.pendingUpdate
        ? { id: record.pendingUpdate.id, createdAt: date(record.pendingUpdate.createdAt), modifiedAt: null, appliesAt: date(record.pendingUpdate.appliesAt), productId: record.pendingUpdate.productId, seats: null }
        : null,
    }
  }

  const order = (record: OrderRecord): Order => {
    const amounts = orderAmounts(record)
    const productRecord = state.products[record.productId]
    const subscriptionRecord = record.subscriptionId ? state.subscriptions[record.subscriptionId] : undefined
    return {
      id: record.id,
      createdAt: date(record.createdAt),
      modifiedAt: optionalDate(record.modifiedAt),
      status: record.status,
      paid: true,
      ...amounts,
      appliedBalanceAmount: 0,
      dueAmount: 0,
      refundedTaxAmount: 0,
      currency: record.currency,
      billingReason: record.billingReason,
      billingName: null,
      billingAddress: null,
      invoiceNumber: record.invoiceNumber,
      isInvoiceGenerated: record.isInvoiceGenerated,
      receiptNumber: null,
      seats: null,
      customerId: record.customerId,
      productId: record.productId,
      discountId: record.discountId,
      subscriptionId: record.subscriptionId,
      checkoutId: record.checkoutId,
      metadata: record.metadata,
      customFieldData: record.customFieldData,
      platformFeeAmount: 0,
      platformFeeCurrency: null,
      customer: subordinateCustomer(state.customers[record.customerId]!),
      product: productRecord ? { ...productBase(productRecord), metadata: productRecord.metadata } : null,
      discount: discountBase(state.discounts[record.discountId ?? '']),
      subscription: subscriptionRecord ? subscriptionFields(subscriptionRecord) : null,
      items: [{ id: `${record.id}:item`, createdAt: date(record.createdAt), modifiedAt: null, label: record.label, amount: record.subtotalAmount, taxAmount: 0, proration: false, productPriceId: productRecord?.prices[0]?.id ?? null }],
      description: record.label,
      refundableAmount: amounts.netAmount - record.refundedAmount,
      refundableTaxAmount: 0,
    }
  }

  const refund = (record: RefundRecord): Refund => ({
    id: record.id,
    createdAt: date(record.createdAt),
    modifiedAt: null,
    metadata: record.metadata,
    status: 'succeeded',
    reason: record.reason as Refund['reason'],
    amount: record.amount,
    taxAmount: 0,
    currency: record.currency,
    organizationId,
    orderId: record.orderId,
    subscriptionId: record.subscriptionId,
    customerId: record.customerId,
    revokeBenefits: record.revokeBenefits,
    dispute: null,
  })

  /** The checkout's product price in its currency (its native presentment price), else the product's first. */
  const checkoutPrice = (record: CheckoutRecord) => {
    const live = state.products[record.productId]!.prices.filter(entry => !entry.isArchived && entry.amountType === 'fixed')
    return (record.currency ? live.find(entry => entry.priceCurrency === record.currency) : undefined) ?? live[0]
  }

  /** What a checkout costs: the price in its currency, the discount off it, and the total. */
  const checkoutAmounts = (record: CheckoutRecord) => {
    const productRecord = state.products[record.productId]!
    const price = checkoutPrice(record)
    const amount = price?.priceAmount ?? 0
    const discountRecord = state.discounts[record.discountId ?? '']
    const off = discountRecord ? discountOff(discountRecord, amount, price?.priceCurrency ?? productRecord.prices[0]?.priceCurrency ?? 'usd') : 0
    return { amount, discountAmount: off, netAmount: amount - off, taxAmount: 0, totalAmount: amount - off, currency: price?.priceCurrency ?? productRecord.prices[0]?.priceCurrency ?? 'usd' }
  }

  const checkoutPublic = (record: CheckoutRecord): CheckoutPublic => {
    const productRecord = state.products[record.productId]!
    const amounts = checkoutAmounts(record)
    const prices = livePrices(productRecord)
    const discountRecord = state.discounts[record.discountId ?? '']
    return {
      id: record.id,
      createdAt: date(record.createdAt),
      modifiedAt: optionalDate(record.modifiedAt),
      customFieldData: record.customFieldData,
      paymentProcessor: 'stripe',
      status: record.status,
      clientSecret: record.clientSecret,
      url: `${baseUrl}/checkout/${record.id}`,
      expiresAt: date(record.expiresAt),
      successUrl: record.successUrl,
      returnUrl: record.returnUrl,
      embedOrigin: record.embedOrigin,
      ...amounts,
      taxBehavior: null,
      allowTrial: record.allowTrial,
      activeTrialInterval: record.allowTrial ? record.trialInterval : null,
      activeTrialIntervalCount: record.allowTrial ? record.trialIntervalCount : null,
      trialEnd: null,
      organizationId,
      productId: record.productId,
      productPriceId: checkoutPrice(record)?.id ?? prices[0]?.id ?? null,
      discountId: record.discountId,
      allowDiscountCodes: record.allowDiscountCodes,
      requireBillingAddress: record.requireBillingAddress,
      isDiscountApplicable: true,
      isFreeProductPrice: amounts.amount === 0,
      isPaymentRequired: amounts.totalAmount > 0,
      isPaymentSetupRequired: productRecord.recurringInterval !== null && amounts.totalAmount > 0,
      isPaymentFormRequired: amounts.totalAmount > 0,
      customerId: record.customerId,
      isBusinessCustomer: record.isBusinessCustomer,
      customerName: record.customerName,
      customerEmail: record.customerEmail,
      customerIpAddress: null,
      customerBillingName: null,
      customerBillingAddress: null,
      customerTaxId: null,
      locale: record.locale,
      paymentProcessorMetadata: {},
      billingAddressFields: { country: 'required', state: 'disabled', city: 'disabled', postalCode: 'disabled', line1: 'disabled', line2: 'disabled' },
      products: record.productIds.flatMap(id => state.products[id] ? [checkoutProduct(state.products[id])] : []),
      product: checkoutProduct(productRecord),
      productPrice: prices.find(entry => entry.id === checkoutPrice(record)?.id) ?? prices[0] ?? null,
      prices: { [productRecord.id]: prices },
      discount: discountRecord ? discountFields(discountRecord) as CheckoutPublic['discount'] : null,
      organization: { id: organizationId, createdAt: date(state.organization.createdAt), modifiedAt: null, name: state.organization.name, slug: state.organization.slug, avatarUrl: null, prorationBehavior: 'prorate', allowCustomerUpdates: true },
      attachedCustomFields: attachedCustomFields(productRecord),
    }
  }

  const checkout = (record: CheckoutRecord): Checkout => {
    const { organization: _organization, ...rest } = checkoutPublic(record)
    return {
      ...rest,
      trialInterval: record.trialInterval,
      trialIntervalCount: record.trialIntervalCount,
      metadata: record.metadata,
      externalCustomerId: record.externalCustomerId,
      subscriptionId: record.subscriptionId,
      customerMetadata: {},
    }
  }

  const customerState = (record: CustomerRecord): CustomerState => {
    const activeSubscriptions = Object.values(state.subscriptions)
      .filter(entry => entry.customerId === record.id && (entry.status === 'active' || entry.status === 'trialing'))
      .map(entry => ({
        id: entry.id,
        createdAt: date(entry.createdAt),
        modifiedAt: optionalDate(entry.modifiedAt),
        customFieldData: {},
        metadata: entry.metadata,
        status: entry.status as 'active' | 'trialing',
        amount: entry.amount,
        currency: entry.currency,
        recurringInterval: entry.recurringInterval,
        currentPeriodStart: date(entry.currentPeriodStart),
        currentPeriodEnd: date(entry.currentPeriodEnd),
        trialStart: optionalDate(entry.trialStart),
        trialEnd: optionalDate(entry.trialEnd),
        cancelAtPeriodEnd: entry.cancelAtPeriodEnd,
        canceledAt: optionalDate(entry.canceledAt),
        startedAt: date(entry.startedAt),
        endsAt: optionalDate(entry.endsAt),
        productId: entry.productId,
        discountId: entry.discountId,
        meters: subscriptionMeters(entry).map(({ meterRecord: _meterRecord, ...meterEntry }) => meterEntry),
      }))
    const grantedBenefits = activeGrants(state, record.id).flatMap((grant) => {
      const benefitRecord = state.benefits[grant.benefitId]
      if (!benefitRecord) return []
      return [{ id: grant.id, createdAt: date(grant.createdAt), modifiedAt: optionalDate(grant.modifiedAt), grantedAt: date(grant.grantedAt), benefitId: benefitRecord.id, benefitType: benefitRecord.type, benefitMetadata: benefitRecord.metadata, properties: grantProperties(grant, benefitRecord) }]
    })
    const activeMeters = Object.values(state.customerMeters).filter(entry => entry.customerId === record.id).map((entry) => {
      const balance = customerMeterBalance(state, record.id, entry.meterId)
      return { id: entry.id, createdAt: date(entry.createdAt), modifiedAt: optionalDate(entry.modifiedAt), meterId: entry.meterId, consumedUnits: balance.consumed, creditedUnits: balance.credited, balance: balance.balance }
    })
    const lists = { activeSubscriptions, grantedBenefits, activeMeters }
    return record.type === 'team'
      ? { ...customerBase(record), type: 'team', email: record.email, ...lists }
      : { ...customerBase(record), type: 'individual', email: record.email ?? '', ...lists }
  }

  const benefitGrant = (record: GrantRecord): BenefitGrantWebhook => {
    const benefitRecord = state.benefits[record.benefitId]!
    const built = benefit(benefitRecord)
    const base = {
      id: record.id,
      createdAt: date(record.createdAt),
      modifiedAt: optionalDate(record.modifiedAt),
      grantedAt: date(record.grantedAt),
      isGranted: record.revokedAt === null,
      revokedAt: optionalDate(record.revokedAt),
      isRevoked: record.revokedAt !== null,
      subscriptionId: record.subscriptionId,
      orderId: record.orderId,
      customerId: record.customerId,
      memberId: null,
      benefitId: record.benefitId,
      error: null,
      customer: customer(state.customers[record.customerId]!),
      member: null,
      previousProperties: null,
    }
    switch (built.type) {
      case 'meter_credit':
        return { ...base, benefit: built, properties: { lastCreditedMeterId: built.properties.meterId, lastCreditedUnits: built.properties.units, lastCreditedAt: new Date(record.modifiedAt ?? record.grantedAt).toISOString() } }
      case 'feature_flag':
        return { ...base, benefit: built, properties: {} }
      case 'license_keys':
        return { ...base, benefit: built, properties: grantProperties(record, benefitRecord) }
      case 'downloadables':
        return { ...base, benefit: built, properties: grantProperties(record, benefitRecord) }
      case 'discord':
        return { ...base, benefit: built, properties: grantProperties(record, benefitRecord) }
      case 'github_repository':
        return { ...base, benefit: built, properties: grantProperties(record, benefitRecord) }
      default:
        return { ...base, benefit: built as Extract<Benefit, { type: 'custom' }>, properties: {} }
    }
  }

  const userEvent = (record: EventRecord): UserEvent => {
    const customerRecord = record.customerId ? state.customers[record.customerId] : undefined
    return {
      id: record.id,
      timestamp: date(record.timestamp),
      organizationId,
      customerId: record.customerId,
      customer: customerRecord ? customer(customerRecord) : null,
      externalCustomerId: record.externalCustomerId,
      memberId: null,
      externalMemberId: null,
      childCount: 0,
      parentId: null,
      label: record.name,
      name: record.name,
      source: 'user',
      metadata: record.metadata,
    }
  }

  const session = (record: SessionRecord): CustomerSession => ({
    id: record.id,
    createdAt: date(record.createdAt),
    modifiedAt: null,
    token: record.token,
    expiresAt: date(record.expiresAt),
    returnUrl: record.returnUrl,
    customerPortalUrl: `${baseUrl}/portal/${record.token}`,
    customerId: record.customerId,
    customer: customer(state.customers[record.customerId]!),
  })

  const endpoint = (record: FakeState['endpoints'][string]): WebhookEndpoint => ({
    id: record.id,
    createdAt: date(record.createdAt),
    modifiedAt: null,
    url: record.url,
    name: null,
    format: record.format,
    secret: record.secret,
    organizationId,
    events: record.events as WebhookEndpoint['events'],
    enabled: record.enabled,
  })

  const organization = (): Organization => ({
    id: organizationId,
    createdAt: date(state.organization.createdAt),
    modifiedAt: null,
    name: state.organization.name,
    slug: state.organization.slug,
    avatarUrl: null,
    prorationBehavior: 'prorate',
    allowCustomerUpdates: true,
    email: null,
    website: null,
    socials: [],
    status: 'active',
    detailsSubmittedAt: null,
    ssoEnforced: false,
    defaultPresentmentCurrency: 'usd',
    defaultTaxBehavior: 'location',
    featureSettings: { memberModelEnabled: true },
    subscriptionSettings: { allowMultipleSubscriptions: false, prorationBehavior: 'prorate', benefitRevocationGracePeriod: 0, preventTrialAbuse: true, allowCustomerUpdates: true, ...state.organization.settings?.subscriptionSettings } as Organization['subscriptionSettings'],
    customerEmailSettings: {
      orderConfirmation: false,
      subscriptionCancellation: false,
      subscriptionConfirmation: false,
      subscriptionCycled: false,
      subscriptionCycledAfterTrial: false,
      subscriptionPastDue: false,
      subscriptionPaused: false,
      subscriptionResumed: false,
      subscriptionRenewalReminder: false,
      subscriptionRevoked: false,
      subscriptionTrialConversionReminder: false,
      subscriptionUncanceled: false,
      subscriptionUpdated: false,
      ...state.organization.settings?.customerEmailSettings,
    },
    customerPortalSettings: { usage: { show: true }, subscription: { updateSeats: false, updatePlan: true, pause: false } },
    country: null,
    accountId: null,
    payoutAccountId: null,
    capabilities: { checkoutPayments: true, subscriptionRenewals: true, payouts: false, refunds: true, apiAccess: true, dashboardAccess: true },
  })

  return {
    product,
    benefit,
    customField,
    customer,
    member,
    meter,
    discount,
    subscription,
    order,
    refund,
    checkout,
    checkoutPublic,
    checkoutAmounts,
    customerState,
    benefitGrant,
    userEvent,
    session,
    endpoint,
    organization,
  }
}

export type Models = ReturnType<typeof createModels>

/** A fixed discount's amounts by currency: `amounts`, or the one amount a state saved before them holds. */
export function discountAmounts(record: DiscountRecord): Record<string, number> {
  if (record.amounts) return record.amounts
  return record.amount === undefined ? {} : { [record.currency ?? 'usd']: record.amount }
}

/** How much a discount takes off an amount in `currency`: a percentage of it, or its fixed sum in that currency, up to it. */
export function discountOff(record: DiscountRecord, amount: number, currency: string): number {
  if (record.type === 'percentage') return Math.round(amount * (record.basisPoints ?? 0) / 10_000)
  return Math.min(amount, discountAmounts(record)[currency.toLowerCase()] ?? 0)
}
