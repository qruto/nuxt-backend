import { randomUUID } from 'node:crypto'
import { type CustomerMeterRecord, type EventRecord, type GrantRecord, type MeterRecord, newId, type OrderRecord, type FakeState } from './state'

// Benefit grants and meter balances: what a customer holds. Credits come
// only from meter-credit grants, usage only from ingested events, as at the
// provider.

/** A customer's grants still in force. */
export function activeGrants(state: FakeState, customerId: string): GrantRecord[] {
  return Object.values(state.grants).filter(grant => grant.customerId === customerId && grant.revokedAt === null)
}

/** Whether an event counts against a customer's meter: its name, its customer, and its time. */
function counts(state: FakeState, event: EventRecord, meter: MeterRecord, customerId: string, since: number): boolean {
  if (event.name !== meter.eventName || event.timestamp < since) return false
  if (event.customerId === customerId) return true
  const externalId = state.customers[customerId]?.externalId
  return externalId != null && event.externalCustomerId === externalId
}

/** The usage a meter aggregates for a customer from `since`: events counted, or a property summed. */
export function meterUsage(state: FakeState, meter: MeterRecord, customerId: string, since: number): number {
  let usage = 0
  for (const event of state.events) {
    if (!counts(state, event, meter, customerId, since)) continue
    if (meter.aggregation.func === 'count') usage += 1
    else {
      const value = event.metadata[meter.aggregation.property]
      usage += typeof value === 'number' ? value : 0
    }
  }
  return usage
}

/** A customer's balance on a meter: credited, consumed since the last reset, and what is left. */
export function customerMeterBalance(state: FakeState, customerId: string, meterId: string): { credited: number, consumed: number, balance: number } {
  const entry = Object.values(state.customerMeters).find(row => row.customerId === customerId && row.meterId === meterId)
  const meter = state.meters[meterId]
  const credited = entry?.credited ?? 0
  const consumed = meter ? meterUsage(state, meter, customerId, entry?.resetAt ?? 0) : 0
  return { credited, consumed, balance: credited - consumed }
}

/** The customer's row for a meter, created on first credit. */
function meterRow(state: FakeState, customerId: string, meterId: string, now: number): CustomerMeterRecord {
  const found = Object.values(state.customerMeters).find(row => row.customerId === customerId && row.meterId === meterId)
  if (found) return found
  const row: CustomerMeterRecord = { id: newId(), customerId, meterId, credited: 0, resetAt: null, createdAt: now, modifiedAt: null }
  state.customerMeters[row.id] = row
  return row
}

/**
 * Apply a meter-credit benefit to a customer's meter: `grant` adds its units,
 * `revoke` takes them back, and `cycle` adds them again on rollover or starts
 * the meter over (usage counted from now) without it.
 */
function applyCredits(state: FakeState, grant: GrantRecord, mode: 'grant' | 'revoke' | 'cycle', now: number): void {
  const benefit = state.benefits[grant.benefitId]
  const { meterId, units = 0, rollover = false } = benefit?.type === 'meter_credit' ? benefit.properties : {}
  if (!meterId) return
  const row = meterRow(state, grant.customerId, meterId, now)
  if (mode === 'grant') row.credited += units
  else if (mode === 'revoke') row.credited = Math.max(0, row.credited - units)
  else if (rollover) row.credited += units
  else {
    row.credited = units
    row.resetAt = now
  }
  row.modifiedAt = now
}

/** A new license key, with the benefit's prefix: the provider generates one per grant. */
function licenseKeyFor(prefix: string | null | undefined): { id: string, key: string } {
  const key = randomUUID().toUpperCase()
  return { id: newId(), key: prefix ? `${prefix}-${key}` : key }
}

/** A license key as the provider displays it: masked but for its last six characters. */
export function displayKey(key: string): string {
  return `****-${key.slice(-6)}`
}

/** Grant one benefit to a customer, for a subscription or an order. */
export function grantBenefit(state: FakeState, input: { benefitId: string, customerId: string, subscriptionId: string | null, orderId: string | null }, now: number): GrantRecord {
  const benefit = state.benefits[input.benefitId]
  const grant: GrantRecord = {
    id: newId(),
    ...input,
    ...(benefit?.type === 'license_keys' ? { licenseKey: licenseKeyFor(benefit.properties.prefix) } : {}),
    grantedAt: now,
    revokedAt: null,
    createdAt: now,
    modifiedAt: null,
  }
  state.grants[grant.id] = grant
  applyCredits(state, grant, 'grant', now)
  return grant
}

/** Revoke a grant; one already revoked is left as it is. */
export function revokeGrant(state: FakeState, grant: GrantRecord, now: number): boolean {
  if (grant.revokedAt !== null) return false
  grant.revokedAt = now
  grant.modifiedAt = now
  applyCredits(state, grant, 'revoke', now)
  return true
}

/** A new billing period for a grant: meter credits renew. */
export function cycleGrant(state: FakeState, grant: GrantRecord, now: number): void {
  grant.modifiedAt = now
  applyCredits(state, grant, 'cycle', now)
}

/** An order's amounts, as the provider reports them: no tax in the fake provider. */
export function orderAmounts(order: OrderRecord): { subtotalAmount: number, discountAmount: number, netAmount: number, taxAmount: number, totalAmount: number, refundedAmount: number } {
  const netAmount = order.subtotalAmount - order.discountAmount
  return { subtotalAmount: order.subtotalAmount, discountAmount: order.discountAmount, netAmount, taxAmount: 0, totalAmount: netAmount, refundedAmount: order.refundedAmount }
}
