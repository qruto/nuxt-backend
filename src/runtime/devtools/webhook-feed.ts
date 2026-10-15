import type { BackendDevtoolsBridgeHost, DevtoolsWebhookDeliverySnapshot } from './types'

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
  patch('webhooks', (rows ?? []).map(row => ({
    service: row.service,
    deliveryId: row.deliveryId,
    type: row.type,
    outcome: row.outcome,
    note: row.note,
    receivedAt: row.receivedAt,
    count: row.count,
  })))
}
