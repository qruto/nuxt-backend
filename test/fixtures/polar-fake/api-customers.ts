import { randomBytes } from 'node:crypto'
import { type ApiContext, type Body, find, type Handler, matchesMetadata, metadataOf, newestFirst, paginate, reply, type Route, text } from './api-kit'
import { invalid, notFound } from './errors'
import { type CustomerRecord, type MemberRecord, newId, type SessionRecord, type FakeState } from './state'

// Customers, the way the provider keys them: an external id unique across
// customers, an individual's email unique among individuals, a team customer
// with its members (its owner first), and customer sessions that open the
// fake portal. Deleting a customer, by its external id or its own, ends its
// subscriptions first, revoked with the customer already marked deleted,
// anonymizes it when asked, and from then on it reads as gone.

/** How long a customer session lasts. */
const SESSION_MS = 60 * 60 * 1000

/** The customer an external id names, or `undefined`: a deleted one is gone. */
export function customerByExternalId(state: FakeState, externalId: string): CustomerRecord | undefined {
  return Object.values(state.customers).find(customer => customer.externalId === externalId && !customer.deletedAt)
}

/** Refuse an external id another customer has, or an individual's email another individual has. */
function refuseTaken(state: FakeState, candidate: { id?: string, type: string, email: string | null, externalId: string | null }): void {
  const others = Object.values(state.customers).filter(customer => customer.id !== candidate.id)
  if (candidate.externalId && others.some(customer => customer.externalId === candidate.externalId)) {
    throw invalid('external_id', 'A customer with this external ID already exists.')
  }
  const email = candidate.email?.toLowerCase()
  if (candidate.type === 'individual' && email && others.some(customer => customer.type === 'individual' && customer.email?.toLowerCase() === email)) {
    throw invalid('email', 'A customer with this email address already exists.')
  }
}

export function customerRoutes(context: ApiContext): Route[] {
  const { state, models, flows, deliveries, now } = context

  /** Add a member to a team customer, and say so. */
  const addMember = (customer: CustomerRecord, input: { email: string, name: string | null, externalId: string | null, role: MemberRecord['role'] }): MemberRecord => {
    const member: MemberRecord = { id: newId(), customerId: customer.id, ...input, createdAt: now() }
    state.members[member.id] = member
    deliveries.emit('member.created', models.member(member))
    return member
  }

  /** The owner member a team customer starts with: the one the request names. */
  const addOwner = (customer: CustomerRecord, owner: Body | undefined) => {
    const email = owner ? text(owner, 'email') : customer.email
    if (email) addMember(customer, { email, name: owner ? text(owner, 'name') : customer.name, externalId: owner ? text(owner, 'external_id') : null, role: 'owner' })
  }

  const createCustomer: Handler = ({ body }) => {
    const type = body.type === 'team' ? 'team' : 'individual'
    const customer: CustomerRecord = { id: newId(), type, email: text(body, 'email'), name: text(body, 'name'), externalId: text(body, 'external_id'), metadata: metadataOf(body.metadata), createdAt: now(), modifiedAt: null }
    if (type === 'individual' && !customer.email) throw invalid('email', 'Field required')
    refuseTaken(state, customer)
    state.customers[customer.id] = customer
    deliveries.emit('customer.created', models.customer(customer))
    if (type === 'team') addOwner(customer, body.owner as Body | undefined)
    return reply(201, 'customer', models.customer(customer))
  }

  const listCustomers: Handler = ({ query }) => {
    const email = query.get('email')?.toLowerCase()
    const search = query.get('query')?.toLowerCase()
    const items = newestFirst(Object.values(state.customers)).filter(customer =>
      !customer.deletedAt
      && matchesMetadata(query, customer.metadata)
      && (!email || customer.email?.toLowerCase() === email)
      && (!search || `${customer.email ?? ''} ${customer.name ?? ''}`.toLowerCase().includes(search)))
    const page = paginate(items, query)
    return reply(200, 'customers', { ...page, items: page.items.map(models.customer) })
  }

  /** Apply a customer update: what it names; an individual becomes a team, never back. */
  const applyCustomerUpdate = (customer: CustomerRecord, body: Body) => {
    const next = { ...customer }
    if ('external_id' in body) {
      const externalId = text(body, 'external_id')
      if (customer.externalId && externalId !== customer.externalId) throw invalid('external_id', 'The external ID of a customer can\'t be changed once set.')
      next.externalId = externalId
    }
    if ('email' in body) next.email = text(body, 'email')
    if ('name' in body) next.name = text(body, 'name')
    if ('metadata' in body) next.metadata = metadataOf(body.metadata)
    if (body.type === 'individual' && customer.type === 'team') throw invalid('type', 'A team customer can\'t become an individual one.')
    if (body.type === 'team') next.type = 'team'
    refuseTaken(state, next)
    const becameTeam = customer.type === 'individual' && next.type === 'team'
    Object.assign(customer, next, { modifiedAt: now() })
    if (becameTeam && !Object.values(state.members).some(member => member.customerId === customer.id)) addOwner(customer, undefined)
  }

  const updateCustomer: Handler = ({ params, body }) => {
    const customer = find(state.customers, params.id, 'Customer')
    applyCustomerUpdate(customer, body)
    deliveries.emit('customer.updated', models.customer(customer))
    return reply(200, 'customer', models.customer(customer))
  }

  const external = (externalId: string | undefined): CustomerRecord => {
    const customer = externalId ? customerByExternalId(state, externalId) : undefined
    if (!customer) throw notFound('Customer')
    return customer
  }

  const listMembers: Handler = ({ query }) => {
    const customerId = query.get('customer_id')
    const items = newestFirst(Object.values(state.members)).filter(member => !customerId || member.customerId === customerId)
    const page = paginate(items, query)
    return reply(200, 'members', { ...page, items: page.items.map(models.member) })
  }

  /** The member a session is for, which must belong to its customer. */
  const sessionMember = (customer: CustomerRecord, body: Body): string | null => {
    const memberId = text(body, 'member_id')
    const externalMemberId = text(body, 'external_member_id')
    if (!memberId && !externalMemberId) return null
    const member = Object.values(state.members).find(entry => entry.customerId === customer.id && (entry.id === memberId || (externalMemberId !== null && entry.externalId === externalMemberId)))
    if (!member) throw notFound('Member')
    return member.id
  }

  /**
   * Delete a customer: its subscriptions still running end now, revoked
   * with the customer already deleted (`customer.deletedAt` on their
   * events), its members go, and with `anonymize` its name and email too.
   */
  const removeCustomer = (customer: CustomerRecord, query: URLSearchParams) => {
    const time = now()
    customer.deletedAt = time
    customer.modifiedAt = time
    if (query.get('anonymize') === 'true') Object.assign(customer, { name: null, email: customer.type === 'team' ? null : `deleted-${customer.id}@anonymized.invalid` })
    for (const subscription of Object.values(state.subscriptions)) {
      if (subscription.customerId === customer.id && subscription.endedAt === null) flows.revokeSubscription(subscription)
    }
    for (const member of Object.values(state.members)) {
      if (member.customerId === customer.id) Reflect.deleteProperty(state.members, member.id)
    }
    deliveries.emit('customer.deleted', models.customer(customer))
    return { status: 204 }
  }

  const deleteCustomer: Handler = ({ params, query }) => removeCustomer(external(params.externalId), query)

  /** Delete a customer by its own id, keyed by an external id or not; one deleted already is gone. */
  const deleteCustomerById: Handler = ({ params, query }) => {
    const customer = find(state.customers, params.id, 'Customer')
    if (customer.deletedAt) throw notFound('Customer')
    return removeCustomer(customer, query)
  }

  /** Remove a team customer's member by the member's external id. */
  const deleteMember: Handler = ({ params }) => {
    const customer = external(params.externalId)
    const member = Object.values(state.members).find(entry => entry.customerId === customer.id && entry.externalId === params.memberExternalId)
    if (!member) throw notFound('Member')
    Reflect.deleteProperty(state.members, member.id)
    deliveries.emit('member.deleted', models.member(member))
    return { status: 204 }
  }

  const createSession: Handler = ({ body }) => {
    const externalId = text(body, 'external_customer_id')
    const customer = externalId ? external(externalId) : find(state.customers, text(body, 'customer_id') ?? undefined, 'Customer')
    const time = now()
    const session: SessionRecord = { id: newId(), token: `polar_cst_${randomBytes(18).toString('base64url')}`, customerId: customer.id, memberId: sessionMember(customer, body), returnUrl: text(body, 'return_url'), createdAt: time, expiresAt: time + SESSION_MS }
    state.sessions[session.id] = session
    return reply(201, 'customer-session', models.session(session))
  }

  return [
    ['POST', '/v1/customers', createCustomer],
    ['GET', '/v1/customers', listCustomers],
    ['GET', '/v1/customers/external/{externalId}', ({ params }) => reply(200, 'customer', models.customer(external(params.externalId)))],
    ['GET', '/v1/customers/external/{externalId}/state', ({ params }) => reply(200, 'customer-state', models.customerState(external(params.externalId)))],
    ['DELETE', '/v1/customers/external/{externalId}', deleteCustomer],
    ['DELETE', '/v1/customers/external/{externalId}/members/{memberExternalId}', deleteMember],
    ['GET', '/v1/customers/{id}', ({ params }) => reply(200, 'customer', models.customer(find(state.customers, params.id, 'Customer')))],
    ['PATCH', '/v1/customers/{id}', updateCustomer],
    ['DELETE', '/v1/customers/{id}', deleteCustomerById],
    ['GET', '/v1/members', listMembers],
    ['POST', '/v1/customer-sessions', createSession],
  ]
}
