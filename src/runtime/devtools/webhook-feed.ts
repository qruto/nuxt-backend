import { FREE_PLAN_NOTE } from '../../convex/integrations/billing/events.js'
import type { BackendDevtoolsBridgeHost, DevtoolsWebhookDeliverySnapshot } from './types'

/**
 * Fold each run of free-plan deliveries (the free plan's renewals, for
 * every billing entity, every cycle) into one row that counts them, as a
 * tally row does: the latest one's id and time, its type when all of them
 * share it. Rows arrive newest first.
 */
export function foldFreePlanDeliveries(rows: readonly DevtoolsWebhookDeliverySnapshot[]): DevtoolsWebhookDeliverySnapshot[] {
  const folded: DevtoolsWebhookDeliverySnapshot[] = []
  for (const row of rows) {
    const last = folded.at(-1)
    if (row.note === FREE_PLAN_NOTE && last?.note === FREE_PLAN_NOTE && last.service === row.service && last.outcome === row.outcome) {
      folded[folded.length - 1] = { ...last, type: last.type === row.type ? last.type : undefined, count: (last.count ?? 1) + (row.count ?? 1) }
      continue
    }
    folded.push({ ...row })
  }
  return folded
}

/**
 * Mirror the delivery feed's answer into the bridge. The feed answers `null`
 * to anyone but an admin, so that reads as "admins only" rather than as a log
 * with nothing in it. The feed's state goes in before its rows: the activity
 * log compares rows only while the feed stays as it was.
 */
export function patchWebhookFeed(
  patch: BackendDevtoolsBridgeHost['patch'],
  rows: readonly DevtoolsWebhookDeliverySnapshot[] | null,
): void {
  patch('webhookFeed', rows === null ? 'admins-only' : 'readable')
  patch('webhooks', foldFreePlanDeliveries(rows ?? []).map(row => ({
    service: row.service,
    deliveryId: row.deliveryId,
    type: row.type,
    outcome: row.outcome,
    note: row.note,
    receivedAt: row.receivedAt,
    count: row.count,
    ...(row.replayedAt === undefined ? {} : { replayedAt: row.replayedAt }),
  })))
}
