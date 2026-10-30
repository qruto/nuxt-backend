import type { FunctionReference } from 'convex/server'
import { computed, inject, ref, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import type { ChatMessage, ChatThread } from '../../../convex/integrations/ai/chat'
import { type BackendError, getBackendError } from '../utils/backend-error'
import { useLiveQuery } from '../utils/live-query'

export type { ChatMessage, ChatThread } from '../../../convex/integrations/ai/chat'

/** How many messages load first, and how many more each `loadMore` asks for. */
const PAGE = 20

/** The chat functions your chat's module exports (`ai.chat`): pass the whole module, as `api.chat`. */
export interface ChatApiRefs {
  threads: FunctionReference<'query', 'public', Record<string, never>, ChatThread[]>
  messages: FunctionReference<'query', 'public', { threadId: string, paginationOpts: { numItems: number, cursor: string | null } }, { page: ChatMessage[], isDone: boolean, continueCursor: string }>
  send: FunctionReference<'mutation', 'public', { text: string, threadId?: string }, string>
  remove: FunctionReference<'mutation', 'public', { threadId: string }, null>
}

export interface UseChatOptions {
  /** The thread to open first, from a ref or a getter; it follows the getter as it changes. */
  threadId?: MaybeRefOrGetter<string | null | undefined>
}

export interface UseChatReturn {
  /** The person's threads in the active workspace, live, newest first. */
  threads: ComputedRef<ChatThread[]>
  /** The open thread. Set it to open another; `undefined` until the first `send` starts one. */
  threadId: Ref<string | undefined>
  /** The open thread's messages, oldest first, live; a reply being written grows with `status: 'streaming'`. */
  messages: ComputedRef<ChatMessage[]>
  /** Send a message to the open thread, or start one; resolves with the thread's id, rejects with what the server threw. */
  send: (text: string) => Promise<string>
  /** Clear the open thread, so the next `send` starts one. */
  newThread: () => void
  /** Delete a thread for good; the open one closes with it. */
  remove: (threadId: string) => Promise<void>
  /** Load older messages of a long thread. */
  loadMore: () => void
  /** Whether older messages are left to load. */
  canLoadMore: ComputedRef<boolean>
  /** Where the last message stands. */
  status: ComputedRef<'idle' | 'sending' | 'streaming' | 'error'>
  /** Why the last message failed, as a catalog error whose message is safe to show; `null` otherwise. */
  error: ComputedRef<BackendError | null>
}

/** What a reply that could not be written reads as: the model refused it, and nothing was charged. */
const FAILED_REPLY = { code: 'unavailable', service: 'ai', reason: 'provider_refused' }

/**
 * A chat with a model, live: the person's threads, the open thread's
 * messages with the reply streaming into them, and sending. Takes the
 * functions `ai.chat` returns, as your chat's module exports them.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { api } from '#backend/api'
 * const chat = useChat(api.chat, { threadId: () => route.query.thread as string | undefined })
 * </script>
 * <template>
 *   <p v-for="message in chat.messages.value" :key="message.id">{{ message.text }}</p>
 * </template>
 * ```
 *
 * @experimental
 */
export function useChat(chat: ChatApiRefs, options: UseChatOptions = {}): UseChatReturn {
  if (!chat?.messages || !chat.send) throw new Error('[nuxt-backend] useChat() takes the functions ai.chat returns: pass your chat\'s module, such as `useChat(api.chat)`.')
  const auth = inject(ConvexAuthStateKey, null)
  const signedIn = () => auth == null || auth.isAuthenticated.value
  const threadId = ref<string | undefined>(toValue(options.threadId) || undefined)
  if (options.threadId !== undefined) {
    watch(() => toValue(options.threadId), (id) => {
      threadId.value = id || undefined
    })
  }
  const size = ref(PAGE)
  watch(threadId, () => {
    size.value = PAGE
  })

  const listed = useLiveQuery(chat.threads, () => (signedIn() ? {} : 'skip'))
  const read = useLiveQuery(chat.messages, () => (threadId.value && signedIn() ? { threadId: threadId.value, paginationOpts: { numItems: size.value, cursor: null } } : 'skip'))
  const runSend = useMutation(chat.send)
  const runRemove = useMutation(chat.remove)
  const sending = ref(false)
  const refused = shallowRef<BackendError | null>(null)

  const messages = computed(() => (threadId.value ? [...(read.data.value?.page ?? [])].reverse() : []))
  const last = computed(() => messages.value.at(-1))
  const failedReply = computed(() => (last.value?.role === 'assistant' && last.value.status === 'failed' ? getBackendError({ name: 'ConvexError', data: FAILED_REPLY }) : null))
  const error = computed(() => refused.value ?? failedReply.value)

  return {
    threads: computed(() => listed.data.value ?? []),
    threadId,
    messages,
    send: async (text) => {
      refused.value = null
      sending.value = true
      try {
        const id = await runSend({ text, ...(threadId.value ? { threadId: threadId.value } : {}) })
        threadId.value = id
        return id
      }
      catch (caught) {
        refused.value = getBackendError(caught) ?? getBackendError({ name: 'ConvexError', data: { code: 'unavailable', service: 'backend', reason: 'unexpected' } })
        throw caught
      }
      finally {
        sending.value = false
      }
    },
    newThread: () => {
      refused.value = null
      threadId.value = undefined
    },
    remove: async (id) => {
      await runRemove({ threadId: id })
      if (threadId.value === id) threadId.value = undefined
    },
    loadMore: () => {
      if (read.data.value && !read.data.value.isDone) size.value += PAGE
    },
    canLoadMore: computed(() => read.data.value?.isDone === false),
    status: computed(() => {
      if (sending.value) return 'sending'
      if (error.value) return 'error'
      // A message waiting for its reply, or a reply being written.
      if (last.value?.role === 'user' || last.value?.status === 'streaming') return 'streaming'
      return 'idle'
    }),
    error,
  }
}
