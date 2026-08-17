import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useAction, useQuery } from 'nuxt-convex-module/client'

/** The `{ start, body }` pair an `ai.stream(...)` definition exports. */
export interface AiStreamApi {
  /** The start action — reserves credits and returns `{ streamId }`. */
  start: unknown
  /** The reactive persisted-body query. */
  body: unknown
}

export type AiStreamStatus = 'idle' | 'pending' | 'streaming' | 'done' | 'error' | 'timeout'

export interface UseAiStreamOptions {
  /**
   * Attach to an existing stream (viewer mode — e.g. after a reload) instead
   * of driving a new one. The persisted body streams in reactively.
   */
  streamId?: MaybeRefOrGetter<string | null | undefined>
  /** Override the stream endpoint. Default `<convex site url>/ai/stream`. */
  url?: MaybeRefOrGetter<string | undefined>
  /** Extra headers for the driving fetch. */
  headers?: MaybeRefOrGetter<Record<string, string> | undefined>
}

export interface UseAiStreamReturn {
  /** The streamed text so far (live while driving; persisted otherwise). */
  text: ComputedRef<string>
  status: ComputedRef<AiStreamStatus>
  isStreaming: ComputedRef<boolean>
  /** The active stream's id — hand it to another client to watch along. */
  streamId: ComputedRef<string | undefined>
  /**
   * Start a new metered stream: runs the `start` action (credits reserve,
   * rate limit), then drives the HTTP stream. Resolves with the stream id as
   * soon as driving begins.
   */
  start: (args?: Record<string, unknown>) => Promise<string>
  /** Abort the driving fetch (the server releases the unfinished spend). */
  stop: () => void
}

/**
 * Drive a metered, persisted AI text stream (an `ai.stream(...)` definition
 * from `nuxt-backend/ai`). Streams over HTTP while the text also persists
 * server-side — reload mid-stream (or pass `streamId`) and the persisted body
 * continues reactively. A failed or aborted stream releases its credits.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { api } from '#backend/_generated/api'
 * const echo = useAiStream({ start: api.ai.startEcho, body: api.ai.echoBody })
 * </script>
 * <template>
 *   <button @click="echo.start({ prompt: 'hello' })">Generate</button>
 *   <pre>{{ echo.text.value }}</pre>
 * </template>
 * ```
 */
export function useAiStream(stream: AiStreamApi, options: UseAiStreamOptions = {}): UseAiStreamReturn {
  const runStart = useAction(stream.start as never)

  const drivenText = ref('')
  const drivenStatus = ref<AiStreamStatus>('idle')
  const driving = ref(false)
  const activeStreamId = ref<string | undefined>()
  let controller: AbortController | null = null

  // Viewer/fallback path: the reactive persisted body. Subscribed whenever a
  // stream id exists and this client is not (or no longer) driving.
  const watchedId = computed(() => toValue(options.streamId) ?? activeStreamId.value)
  const bodyArgs = computed(() => driving.value || !watchedId.value ? undefined : { streamId: watchedId.value })
  const body = useQuery(
    stream.body as never,
    // `undefined` args skip the subscription ('skip' convention).
    (() => bodyArgs.value ?? 'skip') as never,
  ) as unknown as ComputedRef<{ text: string, status: string } | undefined>

  const endpoint = computed(() => {
    const explicit = toValue(options.url)
    if (explicit) return explicit
    const publicConfig = useRuntimeConfig().public as { convex?: { siteUrl?: string } }
    const siteUrl = publicConfig.convex?.siteUrl
    return siteUrl ? `${siteUrl.replace(/\/+$/, '')}/ai/stream` : undefined
  })

  const start: UseAiStreamReturn['start'] = async (args = {}) => {
    const url = endpoint.value
    if (!url) {
      throw new Error('[nuxt-backend] useAiStream: no stream endpoint — configure the Convex site URL or pass `url`.')
    }
    stopDriving()
    drivenText.value = ''
    drivenStatus.value = 'pending'
    const { streamId } = await runStart(args as never) as { streamId: string }
    activeStreamId.value = streamId
    driving.value = true
    controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...toValue(options.headers) },
          body: JSON.stringify({ streamId }),
          signal: controller.signal,
        })
        if (!response.ok || !response.body) {
          throw new Error(`stream endpoint answered ${response.status}`)
        }
        drivenStatus.value = 'streaming'
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          drivenText.value += decoder.decode(value, { stream: true })
        }
        drivenText.value += decoder.decode()
        drivenStatus.value = 'done'
      }
      catch (error) {
        if (controller?.signal.aborted) {
          drivenStatus.value = 'idle'
        }
        else {
          drivenStatus.value = 'error'
          console.error('[nuxt-backend] useAiStream: driving fetch failed — falling back to the persisted body.', error)
          // The reactive body keeps serving whatever the server persisted.
          driving.value = false
        }
      }
    })()

    return streamId
  }

  const stopDriving = () => {
    controller?.abort()
    controller = null
    driving.value = false
  }

  return {
    text: computed(() => driving.value ? drivenText.value : body.value?.text ?? drivenText.value),
    status: computed<AiStreamStatus>(() => {
      if (driving.value) return drivenStatus.value
      const persisted = body.value?.status as AiStreamStatus | undefined
      return persisted ?? drivenStatus.value
    }),
    isStreaming: computed(() => driving.value
      ? drivenStatus.value === 'streaming' || drivenStatus.value === 'pending'
      : body.value?.status === 'streaming' || body.value?.status === 'pending'),
    streamId: computed(() => watchedId.value ?? undefined),
    start,
    stop: stopDriving,
  }
}
