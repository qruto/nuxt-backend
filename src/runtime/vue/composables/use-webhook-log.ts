import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject } from 'vue'
import { ConvexAuthStateKey, useAction } from 'nuxt-convex-module/client'
import type { WebhookService } from '../../../convex/integrations/webhook-guard.js'
import type { WebhookDeliveryRow, WebhookReplay } from '../../../convex/integrations/webhooks.js'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'

export type { WebhookService } from '../../../convex/integrations/webhook-guard.js'
export type { WebhookDeliveryRow, WebhookReplay } from '../../../convex/integrations/webhooks.js'

/** The rows the Webhooks tab reads: the whole ring. */
const LOG_SIZE = 200

/** The functions `backend/webhooks.ts` re-exports. */
export interface WebhookLogApiRefs {
  getWebhookDeliveries?: FunctionReference<'query', 'public', { limit?: number }, WebhookDeliveryRow[] | null>
  replayWebhookDelivery?: FunctionReference<'action', 'public', { service: WebhookService, deliveryId: string }, WebhookReplay>
}

export interface UseWebhookLogOptions {
  /** Override the injected `api.webhooks` namespace. */
  api?: WebhookLogApiRefs
}

export interface UseWebhookLogReturn {
  /** The delivery log, newest first, live. `null` for a caller who is no administrator, `undefined` until it is read. */
  deliveries: ComputedRef<WebhookDeliveryRow[] | null | undefined>
  isLoading: ComputedRef<boolean>
  /** `true` once the read answered that this caller is no administrator. */
  isRefused: ComputedRef<boolean>
  /** `true` while a replay runs. */
  isPending: ComputedRef<boolean>
  /** Why the last replay failed, else why the log could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Ask the delivery's provider to send it again. Rejects with the failure, which `error` holds too. */
  replay: (row: Pick<WebhookDeliveryRow, 'service' | 'deliveryId'>) => Promise<WebhookReplay>
}

/**
 * The admin console's Webhooks tab, as data: the delivery log of both
 * providers through `backend/webhooks.ts`, which answers administrators
 * only, and a replay through the provider's own redelivery. A replay is an
 * administrator's in person and takes a recent sign-in
 * (`useReauthentication().withReauthentication` asks for one).
 *
 * @internal
 */
export function useWebhookLog(options: UseWebhookLogOptions = {}): UseWebhookLogReturn {
  const api = useBackendNamespace<WebhookLogApiRefs>('webhooks', 'useWebhookLog', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const read = api?.getWebhookDeliveries ? useLiveQuery(api.getWebhookDeliveries, () => (signedOut.value ? 'skip' : { limit: LOG_SIZE })) : absentQuery<WebhookDeliveryRow[] | null>()
  const send = api?.replayWebhookDelivery ? useAction(api.replayWebhookDelivery) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  return {
    deliveries: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value) return null
      return read.data.value
    }),
    isLoading: computed(() => authLoading.value || (!signedOut.value && read.isLoading.value)),
    isRefused: computed(() => !signedOut.value && read.data.value === null),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : read.error.value)),
    replay: row => run(async () => {
      if (!send) throw new Error('[nuxt-backend] Replaying a delivery needs `replayWebhookDelivery` re-exported from setupWebhooks() in backend/webhooks.ts (`export const { getWebhookDeliveries, replayWebhookDelivery } = webhooks.api`), or pass `{ api }` to useWebhookLog().')
      return await send({ service: row.service as WebhookService, deliveryId: row.deliveryId })
    }),
  }
}
