import { computed, ref, useId } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import { useWebhookLog, type WebhookDeliveryRow } from '../../composables/use-webhook-log'
import { useAdminChanges } from '../../utils/admin-changes'

// The Webhooks tab's state and actions, headless: `AdminWebhooks.vue`
// renders it. The log of both providers, newest first, narrowed by service;
// each verified delivery has a Replay button, which runs behind a recent
// sign-in, its outcome in the tab's message. A row counting refused
// requests has none: nothing verified to send again.

/** The services the filter lists. */
export const WEBHOOK_SERVICES = ['billing', 'email'] as const

/** A key that tells one row of the log from every other. */
export function deliveryKey(row: Pick<WebhookDeliveryRow, 'service' | 'deliveryId' | 'outcome' | 'receivedAt'>): string {
  return `${row.service}:${row.outcome}:${row.deliveryId}:${row.receivedAt}`
}

/**
 * The Webhooks tab, as state and actions.
 *
 * @internal
 */
export function useWebhooksTab() {
  const log = useWebhookLog()
  const changes = useAdminChanges()
  const { t, errorMessage, locale, message, running, change, busy } = changes
  const id = useId()
  const service = ref<'all' | typeof WEBHOOK_SERVICES[number]>('all')

  const rows = computed<WebhookDeliveryRow[]>(() => (log.deliveries.value ?? []).filter(row => service.value === 'all' || row.service === service.value))
  const date = (at: number) => formatBillingDate(at, { dateStyle: 'medium', timeStyle: 'medium' }, locale.value)

  return {
    id,
    t,
    errorMessage,
    log,
    rows,
    message,
    running,
    busy,
    service,
    services: WEBHOOK_SERVICES,
    date,
    key: deliveryKey,
    /** A tally stands for requests refused before any signature verified: there is nothing to replay. */
    replayable: (row: WebhookDeliveryRow) => row.count === undefined,
    serviceName: (value: string) => (value === 'billing' || value === 'email' ? t(`webhooks.services.${value}`) : value),
    replay: (row: WebhookDeliveryRow) => change(`replay:${deliveryKey(row)}`, () => log.replay(row), () => t('webhooks.replaySent')),
  }
}
