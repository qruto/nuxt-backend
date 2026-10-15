import { describe, expect, it } from 'vitest'
import { createBackendDevtoolsBridge } from '../../src/runtime/devtools/bridge'
import { patchWebhookFeed } from '../../src/runtime/devtools/webhook-feed'

// The delivery feed is admin-only: `getWebhookDeliveries` answers `null` to
// everyone else. The bridge must say so, not show a log with nothing in it,
// and the log an admin then reads is state, not a burst of new deliveries.

const paid = { service: 'billing', deliveryId: 'd1', type: 'order.paid', outcome: 'ok', receivedAt: 1 }

describe('patchWebhookFeed', () => {
  it('marks a null answer admins-only, with an empty log', () => {
    const bridge = createBackendDevtoolsBridge()
    patchWebhookFeed(bridge.patch, null)

    expect(bridge.getSnapshot()).toMatchObject({ webhookFeed: 'admins-only', webhooks: [] })
  })

  it('copies an admin\'s rows field by field, a tally\'s count included', () => {
    const bridge = createBackendDevtoolsBridge()
    const tally = { service: 'email', deliveryId: 'junk', outcome: 'invalid_signature', receivedAt: 2, count: 4 }
    patchWebhookFeed(bridge.patch, [{ ...tally, extra: 'not for the panel' } as typeof tally, paid])

    expect(bridge.getSnapshot().webhookFeed).toBe('readable')
    expect(bridge.getSnapshot().webhooks).toStrictEqual([
      { ...tally, type: undefined, note: undefined },
      { ...paid, note: undefined, count: undefined },
    ])
  })

  it('logs no activity when an admin signs in, then each delivery that arrives', () => {
    const bridge = createBackendDevtoolsBridge()
    patchWebhookFeed(bridge.patch, null)
    patchWebhookFeed(bridge.patch, [paid])
    expect(bridge.getSnapshot().activity).toEqual([])

    patchWebhookFeed(bridge.patch, [{ ...paid, deliveryId: 'd2', receivedAt: 2 }, paid])
    expect(bridge.getSnapshot().activity.map(event => [event.title, event.detail])).toEqual([['Webhook handled', 'billing · order.paid']])
  })
})
