import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery, warnCallShape } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'

/** Email delivery status (mirrors the component `status` query). */
export interface EmailStatus {
  status: string
  errorMessage: string | null
  bounced: boolean
  complained: boolean
  failed: boolean
  deliveryDelayed: boolean
  opened: boolean
  clicked: boolean
}

/** The `email` function group re-exported from your `backend/email.ts`. */
export interface EmailApi {
  getEmailStatus?: FunctionReference<'query', 'public', { emailId: string }, EmailStatus | null>
}

export interface UseEmailStatusOptions {
  /** The email to track (a value, ref or getter), as `send` returned it. Tracking pauses while it is `null`, `undefined` or blank. */
  emailId: MaybeRefOrGetter<string | null | undefined>
  /** Override the injected `api.email` namespace (or the `getEmailStatus` ref). */
  api?: EmailApi
}

export interface UseEmailStatusReturn {
  /** The full status record: `null` if no such email, `undefined` until the first read lands, while paused, and after a failed read. */
  data: ComputedRef<EmailStatus | null | undefined>
  /** The status string (`queued` | `sent` | `delivered` | `bounced` | …), or `undefined`. */
  status: ComputedRef<string | undefined>
  /** `true` until the first status for the current id lands; `false` while paused. */
  isLoading: ComputedRef<boolean>
  /** Why the status could not be read, or `null`. A failed delivery is `isFailed`, not this. */
  error: ComputedRef<BackendError | null>
  /** `true` once the email is delivered. */
  isDelivered: ComputedRef<boolean>
  /** `true` if the email bounced, was marked as spam, or failed to send. */
  isFailed: ComputedRef<boolean>
}

/**
 * Reactive delivery status for a sent email. Updates live as delivery webhooks
 * advance the status (queued → sent → delivered/bounced). Reads through the
 * auto-provided `api.email` namespace; pass `{ api }` to override. It never
 * throws: a failed read shows in `error`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const emailId = ref<string>()
 * const delivery = useEmailStatus({ emailId })
 * </script>
 * <template>
 *   <p v-if="delivery.isFailed.value">Not delivered: {{ delivery.status.value }}</p>
 *   <p v-else-if="delivery.status.value">Status: {{ delivery.status.value }}</p>
 * </template>
 * ```
 */
export function useEmailStatus(options: UseEmailStatusOptions): UseEmailStatusReturn {
  warnCallShape('useEmailStatus', options, 'useEmailStatus({ emailId })')
  const email = useBackendNamespace<EmailApi>('email', 'useEmailStatus', options?.api)

  const read = email.getEmailStatus
    ? useLiveQuery(email.getEmailStatus, computed(() => {
        const id = toValue(options?.emailId)?.trim()
        return id ? { emailId: id } : 'skip'
      }))
    : absentQuery<EmailStatus | null>()
  const data = read.data

  return {
    data,
    status: computed(() => data.value?.status),
    isLoading: read.isLoading,
    error: read.error,
    isDelivered: computed(() => data.value?.status === 'delivered'),
    isFailed: computed(() => Boolean(data.value && (data.value.bounced || data.value.complained || data.value.failed))),
  }
}
