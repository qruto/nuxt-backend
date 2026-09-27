import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import { useQuery } from 'nuxt-convex-module/client'
import { useBackendNamespace } from '../utils/namespace'

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
  /** Override the injected `api.email` namespace (or the `getSandboxInbox` ref). */
  api?: SandboxInboxApi
}

export interface UseSandboxInboxReturn {
  /** The inbox, newest first; `undefined` while loading or without an address. */
  messages: ComputedRef<SandboxMessage[] | undefined>
  /** The newest message, if any. */
  latest: ComputedRef<SandboxMessage | undefined>
  /** The first six-digit code in the newest message — a sign-in code, typically. */
  code: ComputedRef<string | undefined>
  /** `true` until the first read for the current address lands. */
  isLoading: ComputedRef<boolean>
}

const CODE = /\b(\d{6})\b/

/** The first six-digit code in a message: its text, then its subject, then its HTML with tags removed. */
function findCode(message: SandboxMessage | undefined): string | undefined {
  if (!message) return undefined
  for (const source of [message.text, message.subject, message.html?.replace(/<[^>]*>/g, ' ')]) {
    const match = source?.match(CODE)
    if (match) return match[1]
  }
  return undefined
}

/**
 * The mail a sandbox address received within the last hour, live — so a demo,
 * a preview deployment or an e2e run can finish an email-code sign-in without
 * a real mailbox. Only the provider's sandbox addresses
 * (`delivered+label@resend.dev`) have an inbox, and only while email runs in
 * test mode. Needs `getSandboxInbox` re-exported from `backend/email.ts`
 * (`export const { getSandboxInbox } = email.api`); without it the inbox stays
 * empty. Anyone who knows an address can read its inbox, so use it only where
 * every account is a throwaway one.
 *
 * @experimental
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const address = ref('delivered+demo-4f2a@resend.dev')
 * const inbox = useSandboxInbox(address)
 * </script>
 * <template>
 *   <p v-if="inbox.code.value">Your code: {{ inbox.code.value }}</p>
 * </template>
 * ```
 *
 * @param address - The sandbox address to read (reactive). Reading pauses while
 *   it is `undefined` or empty.
 */
export function useSandboxInbox(
  address: MaybeRefOrGetter<string | undefined>,
  options: UseSandboxInboxOptions = {},
): UseSandboxInboxReturn {
  const email = useBackendNamespace<SandboxInboxApi>('email', 'useSandboxInbox', options.api)
  const current = computed(() => toValue(address)?.trim() || undefined)

  const messages = email.getSandboxInbox
    ? useQuery(email.getSandboxInbox, computed(() => current.value ? { address: current.value } : 'skip'))
    : computed<SandboxMessage[] | undefined>(() => undefined)

  const latest = computed(() => messages.value?.[0])

  return {
    messages,
    latest,
    code: computed(() => findCode(latest.value)),
    isLoading: computed(() => Boolean(email.getSandboxInbox) && current.value !== undefined && messages.value === undefined),
  }
}
