import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import { useQuery } from './use-query'
import { useBackendNamespace } from '../provide'

/** Resend delivery status (mirrors the component `status` query). */
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
  /** Override the injected `api.email` namespace (or the `getEmailStatus` ref). */
  api?: EmailApi
}

export interface UseEmailStatusReturn {
  /** The full status record, `null` if unknown, `undefined` while loading. */
  data: ComputedRef<EmailStatus | null | undefined>
  /** The status string (`queued` | `sent` | `delivered` | `bounced` | …), or `undefined`. */
  status: ComputedRef<string | undefined>
  /** `true` until the first status loads. */
  isLoading: ComputedRef<boolean>
  /** `true` once the email is delivered. */
  isDelivered: ComputedRef<boolean>
  /** `true` if the email bounced, was complained about, or failed. */
  isError: ComputedRef<boolean>
}

/**
 * Reactive delivery status for a sent email. Updates live as Resend webhooks
 * advance the status (queued → sent → delivered/bounced). Zero-arg via the
 * auto-provided `api.email` namespace; pass `{ api }` to override.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const emailId = ref<string>()
 * const delivery = useEmailStatus(emailId)
 * </script>
 * <template>
 *   <p v-if="delivery.status.value">Status: {{ delivery.status.value }}</p>
 * </template>
 * ```
 *
 * @param emailId - The Resend email id to track (reactive). Tracking pauses
 *   while it is `undefined`/empty.
 */
export function useEmailStatus(
  emailId: MaybeRefOrGetter<string | undefined>,
  options: UseEmailStatusOptions = {},
): UseEmailStatusReturn {
  const email = (options.api ?? useBackendNamespace<EmailApi>('email') ?? {}) as EmailApi

  const data = email.getEmailStatus
    ? useQuery(email.getEmailStatus, computed(() => {
        const id = toValue(emailId)
        return id ? { emailId: id } : 'skip'
      }))
    : computed<EmailStatus | null | undefined>(() => undefined)

  return {
    data,
    status: computed(() => data.value?.status),
    isLoading: computed(() => toValue(emailId) != null && data.value === undefined),
    isDelivered: computed(() => data.value?.status === 'delivered'),
    isError: computed(() => Boolean(data.value && (data.value.bounced || data.value.complained || data.value.failed))),
  }
}

/** @public */
export const useConvexEmailStatus = useEmailStatus
