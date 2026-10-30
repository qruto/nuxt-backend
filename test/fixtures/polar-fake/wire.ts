import { Benefit$outboundSchema, type Benefit } from '@polar-sh/sdk/models/components/benefit.js'
import { BenefitGrantWebhook$outboundSchema, type BenefitGrantWebhook } from '@polar-sh/sdk/models/components/benefitgrantwebhook.js'
import { Checkout$outboundSchema, type Checkout } from '@polar-sh/sdk/models/components/checkout.js'
import type { CheckoutPublic } from '@polar-sh/sdk/models/components/checkoutpublic.js'
import type { CheckoutPublicConfirmed } from '@polar-sh/sdk/models/components/checkoutpublicconfirmed.js'
import { Customer$outboundSchema, type Customer } from '@polar-sh/sdk/models/components/customer.js'
import type { CustomerSession } from '@polar-sh/sdk/models/components/customersession.js'
import { CustomerState$outboundSchema, type CustomerState } from '@polar-sh/sdk/models/components/customerstate.js'
import { CustomField$outboundSchema, type CustomField } from '@polar-sh/sdk/models/components/customfield.js'
import type { Discount } from '@polar-sh/sdk/models/components/discount.js'
import type { EventsIngestResponse } from '@polar-sh/sdk/models/components/eventsingestresponse.js'
import { Member$outboundSchema, type Member } from '@polar-sh/sdk/models/components/member.js'
import { Meter$outboundSchema, type Meter } from '@polar-sh/sdk/models/components/meter.js'
import { Order$outboundSchema, type Order } from '@polar-sh/sdk/models/components/order.js'
import type { OrderInvoice } from '@polar-sh/sdk/models/components/orderinvoice.js'
import { Organization$outboundSchema, type Organization } from '@polar-sh/sdk/models/components/organization.js'
import { Product$outboundSchema, type Product } from '@polar-sh/sdk/models/components/product.js'
import { Refund$outboundSchema, type Refund } from '@polar-sh/sdk/models/components/refund.js'
import { Subscription$outboundSchema, type Subscription } from '@polar-sh/sdk/models/components/subscription.js'
import type { UserEvent } from '@polar-sh/sdk/models/components/userevent.js'
import type { WebhookEndpoint } from '@polar-sh/sdk/models/components/webhookendpoint.js'

// The JSON the provider's API sends, from the SDK's own models. A model the
// SDK also sends (a webhook's data, a request's part) goes through the SDK's
// outbound schema, which validates it on the way out; the rest (answers the
// SDK only ever reads: lists, sessions, discounts, invoices) are written in
// the same snake_case form. The SDK's response schemas validate every one of
// them again when the app reads it: the drift check.

/** One page of a list, in the SDK's own terms. */
interface Page<Item> {
  items: Item[]
  pagination: { totalCount: number, maxPage: number }
}

/** Every wire shape the fake provider answers or posts, by name, and the SDK model it is built from. */
export interface WireModels {
  'benefit': Benefit
  'benefit-grant': BenefitGrantWebhook
  'checkout': Checkout
  'checkout-public': CheckoutPublic
  'checkout-confirmed': CheckoutPublicConfirmed
  'customer': Customer
  'customer-session': CustomerSession
  'customer-state': CustomerState
  'custom-field': CustomField
  'discount': Discount
  'events-ingested': EventsIngestResponse
  'member': Member
  'meter': Meter
  'order': Order
  'order-invoice': OrderInvoice
  'organization': Organization
  'product': Product
  'refund': Refund
  'subscription': Subscription
  'user-event': UserEvent
  'webhook-endpoint': WebhookEndpoint
  'benefits': Page<Benefit>
  'customers': Page<Customer>
  'custom-fields': Page<CustomField>
  'discounts': Page<Discount>
  'events': Page<UserEvent>
  'members': Page<Member>
  'meters': Page<Meter>
  'orders': Page<Order>
  'organizations': Page<Organization>
  'products': Page<Product>
  'webhook-endpoints': Page<WebhookEndpoint>
}

export type WireName = keyof WireModels

export type WireInput<Name extends WireName> = WireModels[Name]

/** The SDK's outbound schemas, for the models it has them for. */
const SCHEMAS = {
  'benefit': Benefit$outboundSchema,
  'benefit-grant': BenefitGrantWebhook$outboundSchema,
  'checkout': Checkout$outboundSchema,
  'customer': Customer$outboundSchema,
  'customer-state': CustomerState$outboundSchema,
  'custom-field': CustomField$outboundSchema,
  'member': Member$outboundSchema,
  'meter': Meter$outboundSchema,
  'order': Order$outboundSchema,
  'organization': Organization$outboundSchema,
  'product': Product$outboundSchema,
  'refund': Refund$outboundSchema,
  'subscription': Subscription$outboundSchema,
} as const satisfies Partial<Record<WireName, { parse: (value: unknown) => unknown }>>

/** Each list's item shape. */
const LISTS = {
  'benefits': 'benefit',
  'customers': 'customer',
  'custom-fields': 'custom-field',
  'discounts': 'discount',
  'events': 'user-event',
  'members': 'member',
  'meters': 'meter',
  'orders': 'order',
  'organizations': 'organization',
  'products': 'product',
  'webhook-endpoints': 'webhook-endpoint',
} as const satisfies Partial<Record<WireName, WireName>>

/** Records whose own keys are data (metadata keys, product ids, currencies): their keys stay as they are. */
const DATA_RECORDS = new Set(['metadata', 'customFieldData', 'customerMetadata', 'paymentProcessorMetadata', 'benefitMetadata', 'prices', 'amounts'])

const snakeKey = (key: string) => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)

/** A model as the provider writes it: snake_case keys, ISO dates, no `undefined`. */
export function snakeCase(value: unknown, record = false): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(entry => snakeCase(entry))
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [record ? key : snakeKey(key), snakeCase(entry, !record && DATA_RECORDS.has(key) && !Array.isArray(entry))]))
}

/** A model as the provider's API would send it. Throws when it does not fit the SDK's outbound schema. */
export function toWire<Name extends WireName>(name: Name, value: WireInput<Name>): unknown {
  if (name in SCHEMAS) return (SCHEMAS[name as keyof typeof SCHEMAS] as { parse: (input: unknown) => unknown }).parse(value)
  if (name in LISTS) {
    const page = value as Page<never>
    const item = LISTS[name as keyof typeof LISTS]
    return { items: page.items.map(entry => toWire(item, entry)), pagination: { total_count: page.pagination.totalCount, max_page: page.pagination.maxPage } }
  }
  return snakeCase(value)
}
