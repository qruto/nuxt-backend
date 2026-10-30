import { type ApiContext, all, type Body, find, idFor, managedKey, matchesMetadata, metadataOf, newestFirst, numberOf, paginate, reply, requiredText, type Route, strings, text } from './api-kit'
import { invalid, notFound } from './errors'
import { type BenefitRecord, type CustomFieldRecord, type EndpointRecord, type MeterRecord, newId, newWebhookSecret, type PriceRecord, type ProductRecord } from './state'

// The catalog half of the API, what `billing sync` and `doctor` call:
// products and their prices, benefits, meters, checkout custom fields, the
// organization and webhook endpoints.

/** The prices of a create or update payload; an existing price is named by its id. */
function pricesOf(value: unknown, existing: PriceRecord[], now: number, currency: string): PriceRecord[] {
  if (!Array.isArray(value)) throw invalid('prices', 'Field required')
  return value.map((entry: Body) => {
    const kept = typeof entry.id === 'string' ? existing.find(price => price.id === entry.id) : undefined
    if (kept) return { ...kept, isArchived: false }
    const base = { id: newId(), priceCurrency: text(entry, 'price_currency') ?? currency, taxBehavior: (text(entry, 'tax_behavior') ?? null) as PriceRecord['taxBehavior'], isArchived: false, createdAt: now }
    if (entry.amount_type === 'metered_unit') {
      return { ...base, amountType: 'metered_unit' as const, meterId: requiredText(entry, 'meter_id'), unitAmount: typeof entry.unit_amount === 'number' || typeof entry.unit_amount === 'string' ? String(entry.unit_amount) : '0', capAmount: numberOf(entry, 'cap_amount') }
    }
    if (entry.amount_type !== 'fixed') throw invalid('prices', `The fake provider sells fixed and metered prices, not ${String(entry.amount_type)}.`)
    return { ...base, amountType: 'fixed' as const, priceAmount: numberOf(entry, 'price_amount') ?? 0 }
  })
}

/** The custom fields a product attaches, each one checked to exist. */
function attachedFields(context: ApiContext, value: unknown): ProductRecord['customFields'] {
  if (!Array.isArray(value)) return []
  return value.map((entry: Body) => {
    const field = find(context.state.customFields, text(entry, 'custom_field_id') ?? undefined, 'Custom field')
    return { customFieldId: field.id, required: entry.required === true }
  })
}

/** The benefit types the fake provider grants: the provider's, but the shared Slack channel. */
const BENEFIT_TYPES = new Set<BenefitRecord['type']>(['meter_credit', 'feature_flag', 'custom', 'license_keys', 'downloadables', 'discord', 'github_repository'])

function isBenefitType(type: string): type is BenefitRecord['type'] {
  return BENEFIT_TYPES.has(type as BenefitRecord['type'])
}

/**
 * A new benefit's properties, from the provider's create shape: a meter
 * credit's units, a custom note, a license key's prefix, a download's
 * file ids, a community's role (its server stands in for the one the
 * provider reads off the bot's token), a repository and its permission.
 */
function benefitProperties(type: BenefitRecord['type'], properties: Body): BenefitRecord['properties'] {
  switch (type) {
    case 'meter_credit':
      return { units: numberOf(properties, 'units') ?? 0, rollover: properties.rollover === true, meterId: text(properties, 'meter_id') ?? '' }
    case 'custom':
      return { note: text(properties, 'note') }
    case 'license_keys':
      return { prefix: text(properties, 'prefix') }
    case 'downloadables':
      return { files: strings(properties.files) }
    case 'discord':
      return { guildId: newId(), roleId: requiredText(properties, 'role_id') }
    case 'github_repository':
      return {
        repositoryOwner: requiredText(properties, 'repository_owner'),
        repositoryName: requiredText(properties, 'repository_name'),
        permission: (text(properties, 'permission') ?? 'pull') as BenefitRecord['properties']['permission'],
      }
    default:
      return {}
  }
}

export function catalogRoutes(context: ApiContext): Route[] {
  const { state, models, deliveries, now } = context
  const currency = 'usd'

  const listProducts: Route[2] = ({ query }) => {
    const ids = all(query, 'id')
    const archived = query.get('is_archived')
    const search = query.get('query')?.toLowerCase()
    const items = newestFirst(Object.values(state.products)).filter(product =>
      matchesMetadata(query, product.metadata)
      && (ids.length === 0 || ids.includes(product.id))
      && (archived === null || String(product.isArchived) === archived)
      && (!search || product.name.toLowerCase().includes(search)))
    const page = paginate(items, query)
    return reply(200, 'products', { ...page, items: page.items.map(models.product) })
  }

  const createProduct: Route[2] = ({ body }) => {
    const metadata = metadataOf(body.metadata)
    const time = now()
    const product: ProductRecord = {
      id: idFor('product', managedKey(metadata), state.products),
      name: requiredText(body, 'name'),
      description: text(body, 'description'),
      recurringInterval: (text(body, 'recurring_interval') ?? null) as ProductRecord['recurringInterval'],
      recurringIntervalCount: text(body, 'recurring_interval') ? numberOf(body, 'recurring_interval_count') ?? 1 : null,
      trialInterval: (text(body, 'trial_interval') ?? null) as ProductRecord['trialInterval'],
      trialIntervalCount: numberOf(body, 'trial_interval_count'),
      visibility: (text(body, 'visibility') ?? 'public') as ProductRecord['visibility'],
      isArchived: false,
      metadata,
      prices: pricesOf(body.prices, [], time, currency),
      benefitIds: [],
      customFields: attachedFields(context, body.attached_custom_fields),
      createdAt: time,
      modifiedAt: null,
    }
    state.products[product.id] = product
    deliveries.emit('product.created', models.product(product))
    return reply(201, 'product', models.product(product))
  }

  /** Apply a product update: the fields it names, prices it no longer lists archived. */
  const applyProductUpdate = (product: ProductRecord, body: Body) => {
    for (const [field, key] of [['name', 'name'], ['description', 'description'], ['visibility', 'visibility'], ['trial_interval', 'trialInterval'], ['trial_interval_count', 'trialIntervalCount']] as const) {
      if (field in body) (product as unknown as Record<string, unknown>)[key] = body[field] ?? null
    }
    if (typeof body.is_archived === 'boolean') product.isArchived = body.is_archived
    if ('metadata' in body) product.metadata = metadataOf(body.metadata)
    if ('attached_custom_fields' in body) product.customFields = attachedFields(context, body.attached_custom_fields)
    if (Array.isArray(body.prices)) {
      const next = pricesOf(body.prices, product.prices, now(), currency)
      const kept = new Set(next.map(price => price.id))
      product.prices = [...product.prices.filter(price => !kept.has(price.id)).map(price => ({ ...price, isArchived: true })), ...next]
    }
    product.modifiedAt = now()
  }

  const updateProduct: Route[2] = ({ params, body }) => {
    const product = find(state.products, params.id, 'Product')
    applyProductUpdate(product, body)
    deliveries.emit('product.updated', models.product(product))
    return reply(200, 'product', models.product(product))
  }

  /** A product's benefits replaced: its running subscriptions are granted the new ones and lose the removed ones. */
  const updateProductBenefits: Route[2] = ({ params, body }) => {
    const product = find(state.products, params.id, 'Product')
    product.benefitIds = strings(body.benefits).map(id => find(state.benefits, id, 'Benefit').id)
    product.modifiedAt = now()
    deliveries.emit('product.updated', models.product(product))
    context.flows.regrantSubscribers(product)
    return reply(200, 'product', models.product(product))
  }

  const listBenefits: Route[2] = ({ query }) => {
    const types = all(query, 'type')
    const ids = all(query, 'id')
    const items = newestFirst(Object.values(state.benefits)).filter(benefit =>
      (types.length === 0 || types.includes(benefit.type)) && (ids.length === 0 || ids.includes(benefit.id)))
    const page = paginate(items, query)
    return reply(200, 'benefits', { ...page, items: page.items.map(models.benefit) })
  }

  const createBenefit: Route[2] = ({ body }) => {
    const type = requiredText(body, 'type')
    if (!isBenefitType(type)) throw invalid('type', `The fake provider does not grant ${type} benefits.`)
    const properties = (body.properties ?? {}) as Body
    if (type === 'meter_credit') find(state.meters, text(properties, 'meter_id') ?? undefined, 'Meter')
    const metadata = metadataOf(body.metadata)
    const benefit: BenefitRecord = {
      id: idFor('benefit', managedKey(metadata), state.benefits),
      type,
      description: requiredText(body, 'description'),
      metadata,
      properties: benefitProperties(type, properties),
      createdAt: now(),
      modifiedAt: null,
    }
    state.benefits[benefit.id] = benefit
    deliveries.emit('benefit.created', models.benefit(benefit))
    return reply(201, 'benefit', models.benefit(benefit))
  }

  const getBenefit: Route[2] = ({ params }) => reply(200, 'benefit', models.benefit(find(state.benefits, params.id, 'Benefit')))

  /**
   * A benefit changed in the dashboard: its description, metadata, or a
   * meter credit's units and rollover. The provider tells the endpoint with
   * `benefit.updated`, and nothing about the products carrying it.
   */
  const updateBenefit: Route[2] = ({ params, body }) => {
    const benefit = find(state.benefits, params.id, 'Benefit')
    if (typeof body.description === 'string') benefit.description = body.description
    if ('metadata' in body) benefit.metadata = metadataOf(body.metadata)
    const properties = body.properties as Body | undefined
    if (benefit.type === 'meter_credit' && properties) {
      benefit.properties = {
        ...benefit.properties,
        ...(numberOf(properties, 'units') === null ? {} : { units: numberOf(properties, 'units')! }),
        ...(typeof properties.rollover === 'boolean' ? { rollover: properties.rollover } : {}),
      }
    }
    benefit.modifiedAt = now()
    deliveries.emit('benefit.updated', models.benefit(benefit))
    return reply(200, 'benefit', models.benefit(benefit))
  }

  const listMeters: Route[2] = ({ query }) => {
    const page = paginate(newestFirst(Object.values(state.meters)).filter(meter => matchesMetadata(query, meter.metadata)), query)
    return reply(200, 'meters', { ...page, items: page.items.map(models.meter) })
  }

  const createMeter: Route[2] = ({ body }) => {
    const filter = (body.filter ?? {}) as { clauses?: Body[] }
    const eventName = filter.clauses?.find(clause => clause.property === 'name' && clause.operator === 'eq')?.value
    if (typeof eventName !== 'string') throw invalid('filter', 'The fake provider meters events by name: a filter clause `name eq <event>`.')
    const aggregation = (body.aggregation ?? {}) as Body
    const metadata = metadataOf(body.metadata)
    const meter: MeterRecord = {
      id: idFor('meter', managedKey(metadata), state.meters),
      name: requiredText(body, 'name'),
      eventName,
      aggregation: aggregation.func === 'sum' ? { func: 'sum', property: requiredText(aggregation, 'property') } : { func: 'count' },
      metadata,
      createdAt: now(),
    }
    state.meters[meter.id] = meter
    return reply(201, 'meter', models.meter(meter))
  }

  const listCustomFields: Route[2] = ({ query }) => {
    const page = paginate(newestFirst(Object.values(state.customFields)), query)
    return reply(200, 'custom-fields', { ...page, items: page.items.map(models.customField) })
  }

  const createCustomField: Route[2] = ({ body }) => {
    const properties = (body.properties ?? {}) as Body
    const field: CustomFieldRecord = {
      id: newId(),
      type: requiredText(body, 'type') as CustomFieldRecord['type'],
      slug: requiredText(body, 'slug'),
      name: requiredText(body, 'name'),
      ...(Array.isArray(properties.options) ? { options: properties.options as CustomFieldRecord['options'] } : {}),
      metadata: metadataOf(body.metadata),
      createdAt: now(),
    }
    state.customFields[field.id] = field
    return reply(201, 'custom-field', models.customField(field))
  }

  const listOrganizations: Route[2] = ({ query }) => reply(200, 'organizations', { ...paginate([models.organization()], query) })

  /** A settings object as the wire sends it, snake_cased, read camel-cased. */
  const camelCased = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), entry]))
    : undefined

  const updateOrganization: Route[2] = ({ params, body }) => {
    find({ [state.organization.id]: state.organization }, params.id, 'Organization')
    const subscriptionSettings = camelCased(body.subscription_settings)
    const customerEmailSettings = camelCased(body.customer_email_settings)
    state.organization.settings = {
      ...state.organization.settings,
      ...(subscriptionSettings ? { subscriptionSettings } : {}),
      ...(customerEmailSettings ? { customerEmailSettings } : {}),
    }
    return reply(200, 'organization', models.organization())
  }

  const updateEndpoint: Route[2] = ({ params, body }) => {
    const endpoint = find(state.endpoints, params.id, 'WebhookEndpoint')
    if (typeof body.enabled === 'boolean') endpoint.enabled = body.enabled
    if (Array.isArray(body.events)) endpoint.events = strings(body.events)
    return reply(200, 'webhook-endpoint', models.endpoint(endpoint))
  }

  const resetEndpointSecret: Route[2] = ({ params }) => {
    const endpoint = find(state.endpoints, params.id, 'WebhookEndpoint')
    endpoint.secret = newWebhookSecret()
    return reply(200, 'webhook-endpoint', models.endpoint(endpoint))
  }

  const listEndpoints: Route[2] = ({ query }) => {
    const page = paginate(Object.values(state.endpoints), query)
    return reply(200, 'webhook-endpoints', { ...page, items: page.items.map(models.endpoint) })
  }

  const createEndpoint: Route[2] = ({ body }) => {
    const endpoint: EndpointRecord = { id: newId(), url: requiredText(body, 'url'), secret: newWebhookSecret(), format: (text(body, 'format') ?? 'raw') as EndpointRecord['format'], events: strings(body.events), enabled: true, createdAt: now() }
    state.endpoints[endpoint.id] = endpoint
    return reply(201, 'webhook-endpoint', models.endpoint(endpoint))
  }

  return [
    ['GET', '/v1/products', listProducts],
    ['POST', '/v1/products', createProduct],
    ['GET', '/v1/products/{id}', ({ params }) => reply(200, 'product', models.product(find(state.products, params.id, 'Product')))],
    ['PATCH', '/v1/products/{id}', updateProduct],
    ['POST', '/v1/products/{id}/benefits', updateProductBenefits],
    ['GET', '/v1/benefits', listBenefits],
    ['POST', '/v1/benefits', createBenefit],
    ['GET', '/v1/benefits/{id}', getBenefit],
    ['PATCH', '/v1/benefits/{id}', updateBenefit],
    ['GET', '/v1/meters', listMeters],
    ['POST', '/v1/meters', createMeter],
    ['GET', '/v1/custom-fields', listCustomFields],
    ['POST', '/v1/custom-fields', createCustomField],
    ['GET', '/v1/organizations', listOrganizations],
    ['PATCH', '/v1/organizations/{id}', updateOrganization],
    ['GET', '/v1/webhooks/endpoints', listEndpoints],
    ['POST', '/v1/webhooks/endpoints', createEndpoint],
    ['PATCH', '/v1/webhooks/endpoints/{id}', updateEndpoint],
    ['PATCH', '/v1/webhooks/endpoints/{id}/secret', resetEndpointSecret],
    // The provider schedules the redelivery and answers before it goes.
    ['POST', '/v1/webhooks/events/{id}/redeliver', ({ params }) => {
      if (!params.id || !deliveries.redeliver(params.id)) throw notFound('WebhookEvent')
      return { status: 202, body: null }
    }],
  ]
}
