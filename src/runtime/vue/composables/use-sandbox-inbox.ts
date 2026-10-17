import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery, warnCallShape } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { findCode } from '../utils/sandbox-code'

/** A message in a sandbox inbox (mirrors the component `inbox` query). */
export interface SandboxMessage {
  from: string
  subject: string
  text?: string
  html?: string
  /** When it was sent, as epoch ms. */
  receivedAt: number
}

/** The `email` function group re-exported from your `backend/email.ts`. */
export interface SandboxInboxApi {
  getSandboxInbox?: FunctionReference<'query', 'public', { address: string }, SandboxMessage[]>
}

export interface UseSandboxInboxOptions {
  /** The sandbox address to read (a value, ref or getter). Reading pauses while it is `undefined` or blank. */
  address: MaybeRefOrGetter<string | null | undefined>
  /** Override the injected `api.email` namespace (or the `getSandboxInbox` ref). */
  api?: SandboxInboxApi
}

export interface UseSandboxInboxReturn {
  /** The inbox, newest first: `undefined` until the first read lands, without an address, and after a failed read. */
  messages: ComputedRef<SandboxMessage[] | undefined>
  /** The newest message, if any. */
  latest: ComputedRef<SandboxMessage | undefined>
  /** The first six-digit code in the newest message — a sign-in code, typically. */
  code: ComputedRef<string | undefined>
  /** `true` until the first read for the current address lands; `false` without one. */
  isLoading: ComputedRef<boolean>
  /** Why the inbox could not be read, or `null`. */
  error: ComputedRef<BackendError | null>
}

/**
 * The mail a sandbox address received within the last hour, live — so a demo,
 * a preview deployment or an e2e run can finish an email-code sign-in without
 * a real mailbox. Only the provider's sandbox addresses
 * (`delivered+label@resend.dev`) have an inbox, and only while email runs in
 * test mode. Needs `getSandboxInbox` re-exported from `backend/email.ts`
 * (`export const { getSandboxInbox } = email.api`); without it the inbox stays
 * empty. Anyone who knows an address can read its inbox, so use it only where
 * every account is a throwaway one. It never throws: a failed read shows in
 * `error`.
 *
 * @experimental
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const address = ref('delivered+demo-4f2a@resend.dev')
 * const inbox = useSandboxInbox({ address })
 * </script>
 * <template>
 *   <p v-if="inbox.code.value">Your code: {{ inbox.code.value }}</p>
 * </template>
 * ```
 */
export function useSandboxInbox(options: UseSandboxInboxOptions): UseSandboxInboxReturn {
  warnCallShape('useSandboxInbox', options, 'useSandboxInbox({ address })')
  const email = useBackendNamespace<SandboxInboxApi>('email', 'useSandboxInbox', options?.api)
  const current = computed(() => toValue(options?.address)?.trim() || undefined)

  const read = email.getSandboxInbox
    ? useLiveQuery(email.getSandboxInbox, computed(() => current.value ? { address: current.value } : 'skip'))
    : absentQuery<SandboxMessage[]>()
  const messages = read.data

  const latest = computed(() => messages.value?.[0])

  return {
    messages,
    latest,
    code: computed(() => findCode(latest.value)),
    isLoading: read.isLoading,
    error: read.error,
  }
}
