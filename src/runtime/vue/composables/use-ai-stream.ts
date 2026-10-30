import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useAction } from 'nuxt-convex-module/client'
import { type BackendError, failureOf } from '../utils/backend-error'
import { useLiveQuery } from '../utils/live-query'

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
  /** `true` while `start` waits for the server to accept the stream. */
  isPending: ComputedRef<boolean>
  /** The active stream's id — hand it to another client to watch along. */
  streamId: ComputedRef<string | undefined>
  /**
   * Why the last `start` failed — a refusal such as `insufficient_credits`,
   * `rate_limited` or `unauthenticated`, or anything else as
   * `unavailable` (see the composable conventions) — else why its driving
   * fetch failed (the text keeps following the persisted body), else why
   * the persisted body could not be read, else `null`. Cleared when the next
   * `start` begins.
   */
  error: ComputedRef<BackendError | null>
  /**
   * Start a new metered stream: runs the `start` action (credits reserve,
   * rate limit), then drives the HTTP stream. Resolves with the stream id as
   * soon as driving begins. A failed start ends in `status: 'error'` with
   * the failure in `error`, and rejects with the error the call threw.
   */
  start: (args?: Record<string, unknown>) => Promise<string>
  /** Abort the driving fetch, or a start still waiting for the server (the server releases the unfinished spend). `status` reads `'idle'` at once. */
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
 *
 * @experimental Paired with the `nuxt-backend/ai` entry — its return shape
 * may change in a minor release (see STABILITY.md).
 */
export function useAiStream(stream: AiStreamApi, options: UseAiStreamOptions = {}): UseAiStreamReturn {
  const runStart = useAction(stream.start as never)

  const drivenText = ref('')
  const drivenStatus = ref<AiStreamStatus>('idle')
  const driving = ref(false)
  const activeStreamId = ref<string | undefined>()
  const startError = ref<BackendError | null>(null)
  const starting = ref(false)
  // The last start was refused: `status` says 'error' over any persisted
  // body (an attached `streamId`'s included) until the next start.
  const refused = ref(false)
  let controller: AbortController | null = null

  // Viewer/fallback path: the reactive persisted body. Subscribed whenever a
  // stream id exists and this client is not (or no longer) driving.
  const watchedId = computed(() => toValue(options.streamId) ?? activeStreamId.value)
  const bodyArgs = computed(() => driving.value || !watchedId.value ? undefined : { streamId: watchedId.value })
  const bodyRead = useLiveQuery(
    stream.body as never,
    // `undefined` args skip the subscription ('skip' convention).
    (() => bodyArgs.value ?? 'skip') as never,
  )
  const body = bodyRead.data as unknown as ComputedRef<{ text: string, status: string } | undefined>

  const endpoint = computed(() => {
    const explicit = toValue(options.url)
    if (explicit) return explicit
    const publicConfig = useRuntimeConfig().public as { convex?: { siteUrl?: string } }
    const siteUrl = publicConfig.convex?.siteUrl
    return siteUrl ? `${siteUrl.replace(/\/+$/, '')}/ai/stream` : undefined
  })

  // Each start, and each stop, opens a new generation. Whatever an older
  // generation does after that (a start that resolves late, a drive that
  // aborts or fails) writes nothing: only the latest one speaks.
  let generation = 0

  /** Abort the drive in flight, if any. */
  const abortDrive = () => {
    controller?.abort()
    controller = null
    driving.value = false
  }

  /** Drive one accepted stream over HTTP, for as long as its generation is the latest. */
  const drive = async (gen: number, url: string, streamId: string, signal: AbortSignal) => {
    const current = () => gen === generation
    try {
      // fallow-ignore-next-line security-sink -- the stream URL is the deployment site URL from runtime config plus the configured route; verified 2026-09-17
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...toValue(options.headers) },
        body: JSON.stringify({ streamId }),
        signal,
      })
      if (!current()) return
      if (!response.ok || !response.body) {
        throw new Error(`stream endpoint answered ${response.status}`)
      }
      drivenStatus.value = 'streaming'
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (!current()) return
        if (done) break
        drivenText.value += decoder.decode(value, { stream: true })
      }
      drivenText.value += decoder.decode()
      drivenStatus.value = 'done'
    }
    catch (error) {
      // Stopped or replaced: the abort is no failure of the latest stream.
      if (!current()) return
      drivenStatus.value = 'error'
      startError.value = failureOf(error)
      console.error('[nuxt-backend] useAiStream: driving fetch failed — falling back to the persisted body.', error)
      // The reactive body keeps serving whatever the server persisted.
      driving.value = false
    }
  }

  const start: UseAiStreamReturn['start'] = async (args = {}) => {
    const gen = ++generation
    // A new stream replaces the last one, the drive in flight included: a
    // failed start must not read as the previous stream's persisted status.
    abortDrive()
    startError.value = null
    drivenText.value = ''
    activeStreamId.value = undefined
    const fail = (cause: unknown) => {
      drivenStatus.value = 'error'
      refused.value = true
      startError.value = failureOf(cause)
    }
    const url = endpoint.value
    if (!url) {
      const missing = new Error('[nuxt-backend] useAiStream: no stream endpoint — configure the Convex site URL or pass `url`.')
      starting.value = false
      fail(missing)
      throw missing
    }
    refused.value = false
    drivenStatus.value = 'pending'
    starting.value = true
    let streamId: string
    try {
      ({ streamId } = await runStart(args as never) as { streamId: string })
    }
    catch (cause) {
      if (gen === generation) fail(cause)
      throw cause
    }
    finally {
      if (gen === generation) starting.value = false
    }
    // A newer start or a stop came while this one waited: it drives nothing.
    if (gen !== generation) return streamId
    activeStreamId.value = streamId
    driving.value = true
    controller = new AbortController()
    void drive(gen, url, streamId, controller.signal)
    return streamId
  }

  const stop = () => {
    generation++
    // Something in flight stops now, not when its abort lands.
    if (driving.value || starting.value) drivenStatus.value = 'idle'
    starting.value = false
    abortDrive()
  }

  return {
    text: computed(() => driving.value ? drivenText.value : body.value?.text ?? drivenText.value),
    status: computed<AiStreamStatus>(() => {
      if (driving.value || refused.value) return drivenStatus.value
      const persisted = body.value?.status as AiStreamStatus | undefined
      return persisted ?? drivenStatus.value
    }),
    isStreaming: computed(() => driving.value || refused.value
      ? drivenStatus.value === 'streaming' || drivenStatus.value === 'pending'
      : body.value?.status === 'streaming' || body.value?.status === 'pending'),
    isPending: computed(() => starting.value),
    streamId: computed(() => watchedId.value ?? undefined),
    error: computed(() => startError.value ?? bodyRead.error.value),
    start,
    stop,
  }
}
