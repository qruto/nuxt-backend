import { useIntervalFn } from '@vueuse/core'
import { useAction } from 'nuxt-convex-module/client'
import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, ref, shallowRef, toValue, watch } from 'vue'
import { type BackendError, failureOf } from '../utils/backend-error'
import { warnCallShape } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { findCode } from '../utils/sandbox-code'

/** A message in the dev inbox (mirrors the component `inbox` action). */
export interface SandboxMessage {
  from: string
  subject: string
  /** Only the newest message carries its body. */
  text?: string
  html?: string
  /** When the provider accepted it, as epoch ms. */
  receivedAt: number
}

/** The `email` function group re-exported from your `backend/email.ts`. */
export interface SandboxInboxApi {
  getSandboxInbox?: FunctionReference<'action', 'public', { address: string }, SandboxMessage[]>
}

export interface UseSandboxInboxOptions {
  /** The test address to read (a value, ref or getter). Reading pauses while it is `undefined` or blank. */
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

/** How often the page asks for new mail, in ms: a read is two requests at the email provider, which allows 10 a second for the whole team. */
const POLL_MS = 10_000

/**
 * The mail a test address received within the last hour, refreshed while the
 * page is open — so a demo, a preview deployment or an e2e run can finish an
 * email-code sign-in without a real mailbox. Only the provider's test
 * addresses (`delivered+label@resend.dev`) have an inbox, and only while
 * email runs in test mode. The backend reads the mail back from the email
 * provider's own log of sent email with its `EMAIL_API_KEY`, and keeps no
 * copy. Needs `getSandboxInbox` re-exported from `backend/email.ts`
 * (`export const { getSandboxInbox } = email.api`); without it the inbox
 * stays empty. Anyone who knows an address can read its inbox, so use it
 * only where every account is a throwaway one. It never throws: a failed
 * read shows in `error`.
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
  const read = email.getSandboxInbox ? useAction(email.getSandboxInbox) : null

  const messages = shallowRef<SandboxMessage[] | undefined>()
  const error = ref<BackendError | null>(null)
  const loaded = ref(false)
  // The address a read is under way for: a poll never doubles it, a new address never waits for it.
  let inflight: string | undefined

  async function refresh(): Promise<void> {
    const address = current.value
    if (!read || !address || inflight === address) return
    inflight = address
    try {
      const answer = await read({ address })
      // An answer for an address the page has left is dropped.
      if (address !== current.value) return
      messages.value = answer
      error.value = null
    }
    catch (cause) {
      if (address !== current.value) return
      messages.value = undefined
      error.value = failureOf(cause)
    }
    finally {
      if (inflight === address) inflight = undefined
      if (address === current.value) loaded.value = true
    }
  }

  const poll = useIntervalFn(() => {
    void refresh()
  }, POLL_MS, { immediate: false })
  watch(current, (address) => {
    messages.value = undefined
    error.value = null
    loaded.value = false
    // The server renders the page without reading: the browser starts.
    if (!import.meta.client || !address) return poll.pause()
    poll.resume()
    void refresh()
  }, { immediate: true })

  const latest = computed(() => messages.value?.[0])

  return {
    messages: computed(() => messages.value),
    latest,
    code: computed(() => findCode(latest.value)),
    isLoading: computed(() => Boolean(current.value) && Boolean(read) && !loaded.value),
    error: computed(() => error.value),
  }
}
