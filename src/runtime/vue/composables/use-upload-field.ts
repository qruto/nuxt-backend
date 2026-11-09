import { computed, ref, toValue, useId, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { type GenerateUploadUrl, type UploadQueueItem, useUploadQueue } from 'nuxt-convex-module/client'
import { type BackendError, failureOf } from '../utils/backend-error'
import { useBackendNamespace } from '../utils/namespace'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn } from './use-labels'

/**
 * Where an upload field is: waiting for a file, preparing and sending it,
 * waiting for the claim, kept, refused (the deployment or `prepare` turned
 * the file away: pick another), or failed on the way (`retry` sends it
 * again).
 */
export type UploadFieldState = 'ready' | 'uploading' | 'claiming' | 'done' | 'refused' | 'error'

export interface UseUploadFieldOptions {
  /** Your mutation that keeps the file (it calls `storage.claim`). A refusal it throws is the field's. */
  claim: (storageId: string) => Promise<unknown>
  /**
   * Turn the picked file into what is sent, before an upload URL is asked
   * for: shrink a photo, re-encode it, strip its metadata. Runs once per
   * file (a retry sends what it returned) and stops with `signal` when the
   * upload is canceled. A refusal it throws (`backendError(…)`) is the
   * field's, as the claim's is; any other throw is a failure `retry` runs it
   * again for.
   */
  prepare?: (file: File, signal: AbortSignal) => Blob | Promise<Blob>
  /** The types the picker offers, as the `accept` attribute writes them. The claim checks the type again. */
  accept?: MaybeRefOrGetter<string | undefined>
  /** Copy for this field, over app config and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'upload'> | undefined>
  /** The upload URL mutation. Default: `generateUploadUrl` of `backend/storage.ts`. */
  generateUploadUrl?: GenerateUploadUrl
  /** Called with the storage id once the claim went through. */
  onClaimed?: (storageId: string) => void
  /** Called with a refusal or a failure. */
  onError?: (error: BackendError) => void
}

export interface UseUploadFieldReturn {
  /** Where the field is. */
  state: ComputedRef<UploadFieldState>
  /** The file picked last, until another is picked. */
  file: Readonly<Ref<File | null>>
  /** The upload's progress, from 0 to 1. */
  progress: ComputedRef<number>
  /** The storage id of the file the claim kept; `null` before. */
  storageId: Readonly<Ref<string | null>>
  /** Why the last file was refused or failed; `null` otherwise. */
  error: Readonly<Ref<BackendError | null>>
  /** What the live region says: progress, the check, the outcome. */
  announcement: ComputedRef<string>
  /** Upload a file and claim it. Resolves with the kept storage id, or `null` when it was refused, failed or canceled; never rejects. */
  pick: (file: File) => Promise<string | null>
  /**
   * Try the last file again after it failed or was refused, from where it
   * stopped: the claim alone when the file was stored and the claim failed on
   * the way, the transfer again otherwise (a refused file is sent again).
   * Resolves as `pick` does; `null` at once when there is nothing to retry.
   * `<UploadField>` offers it for a failure only: a refused file would be
   * turned away again.
   */
  retry: () => Promise<string | null>
  /** Abort the upload in flight. */
  cancel: () => void
  /** Open the browser's file picker. */
  open: () => void
  /** The field's words, for markup of your own. */
  labels: UseLabelsReturn<'upload'>
  /** Attribute bindings, with the accessibility attributes and the handlers, for markup of your own. */
  bind: {
    /** The field: `data-upload="field"`, `data-state`, and drop as the second path. */
    root: ComputedRef<Record<string, unknown>>
    /** The visible label. */
    label: ComputedRef<Record<string, unknown>>
    /** The native file input, hidden: the button opens it. */
    input: ComputedRef<Record<string, unknown>>
    /** The button that opens the picker: the keyboard path. */
    button: ComputedRef<Record<string, unknown>>
    /** The progress bar. */
    progress: ComputedRef<Record<string, unknown>>
    /** The cancel button. */
    cancel: ComputedRef<Record<string, unknown>>
    /** The button that tries a failed file again. */
    retry: ComputedRef<Record<string, unknown>>
    /** The live region. */
    status: ComputedRef<Record<string, unknown>>
    /** The refusal. */
    error: ComputedRef<Record<string, unknown>>
  }
}

/** A failure that is the deployment's decision about the file, rather than a failure on the way. */
const isRefusal = (error: BackendError): boolean =>
  error.code !== 'unavailable' && error.code !== 'unauthenticated' && error.code !== 'rate_limited'

/**
 * The upload field without its markup: pick a file (by the button or by
 * dropping it), run your `prepare` on it, upload it with the base module's
 * `useUploadQueue` through the upload URL `setupStorage` mints, then hand
 * the storage id to your `claim`, where the deployment checks it. A refusal
 * (the claim's or `prepare`'s) ends in `refused`, for another file; a
 * failure on the way ends in `error`, which `retry` resumes. State, actions
 * and bindings, so markup of your own stays accessible; `<UploadField>` is
 * this with the package's markup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const attach = useMutation(api.strips.attachFile)
 * const field = useUploadField({ claim: fileId => attach({ id: props.stripId, fileId }) })
 * </script>
 * <template>
 *   <div v-bind="field.bind.root.value">
 *     <input v-bind="field.bind.input.value">
 *     <button v-bind="field.bind.button.value">Add a photo</button>
 *     <p v-bind="field.bind.status.value">{{ field.announcement.value }}</p>
 *   </div>
 * </template>
 * ```
 */
export function useUploadField(options: UseUploadFieldOptions): UseUploadFieldReturn {
  const labels = useLabels('upload', () => toValue(options.labels))
  const generateUploadUrl = options.generateUploadUrl
    ?? useBackendNamespace<{ generateUploadUrl?: GenerateUploadUrl }>('storage', 'UploadField').generateUploadUrl
  const id = useId() ?? `upload-${Math.random().toString(36).slice(2)}`
  const ids = { label: `${id}-label`, input: `${id}-input`, button: `${id}-button`, status: `${id}-status`, error: `${id}-error` }

  const file = ref<File | null>(null)
  const storageId = ref<string | null>(null)
  const error = ref<BackendError | null>(null)
  /** A field with no upload URL mutation to call: it fails every file with this. */
  const unusable = ref(false)
  const canceled = ref(false)
  const dragging = ref(false)
  let input: HTMLInputElement | null = null

  /** What each file's `pick` or `retry` waits for, by queue item. */
  const waiting = new Map<string, (kept: string | null) => void>()
  const settle = (itemId: string, kept: string | null) => {
    waiting.get(itemId)?.(kept)
    waiting.delete(itemId)
  }
  const settled = (itemId: string) => new Promise<string | null>(resolve => waiting.set(itemId, resolve))

  // The base module's queue, one file at a time: `prepare`, the transfer,
  // then the claim as its `after` step, so a retry picks up where the file
  // stopped and a refusal is told from a failure.
  const queue = generateUploadUrl
    ? useUploadQueue(generateUploadUrl, {
        concurrency: 1,
        ...(options.prepare ? { prepare: (picked: Blob, _item: UploadQueueItem, signal: AbortSignal) => options.prepare!(picked as File, signal) } : {}),
        after: async (stored) => {
          await options.claim(stored)
        },
        isRefusal: cause => isRefusal(failureOf(cause)),
        onItemSuccess: (stored, item) => {
          if (item.id !== current.value?.id) return
          storageId.value = stored
          settle(item.id, stored)
          options.onClaimed?.(stored)
        },
        onItemError: (cause, item) => {
          // A file canceled or replaced is aborted, which ends it here too.
          if (item.id !== current.value?.id) return
          fail(failureOf(cause))
          settle(item.id, null)
        },
      })
    : null
  /** The field's one file in the queue, or `null` before a pick (and after a cancel). */
  const current = computed<UploadQueueItem | null>(() => queue?.items.value[0] ?? null)

  const state = computed<UploadFieldState>(() => {
    const item = current.value
    if (!item) return unusable.value ? 'error' : 'ready'
    if (item.status === 'success') return 'done'
    if (item.status === 'error') return item.refused ? 'refused' : 'error'
    return item.stage === 'after' ? 'claiming' : 'uploading'
  })
  const progress = computed(() => current.value?.progress ?? 0)
  const busy = computed(() => state.value === 'uploading' || state.value === 'claiming')

  function fail(failure: BackendError) {
    error.value = failure
    options.onError?.(failure)
  }

  /** Forget the file in the queue: aborted when it still runs, and its `pick` answered `null`. */
  function forget() {
    const item = current.value
    if (!item || !queue) return
    queue.remove(item.id)
    settle(item.id, null)
  }

  async function pick(picked: File): Promise<string | null> {
    if (busy.value) return null
    file.value = picked
    error.value = null
    canceled.value = false
    if (!queue) {
      unusable.value = true
      fail(failureOf(new Error('[nuxt-backend] <UploadField> needs `generateUploadUrl` re-exported from setupStorage() in backend/storage.ts (`export const { generateUploadUrl } = storage.api`).')))
      return null
    }
    forget()
    queue.enqueue(picked)
    return settled(current.value!.id)
  }

  function retry(): Promise<string | null> {
    const item = current.value
    if (!queue || !item || item.status !== 'error') return Promise.resolve(null)
    error.value = null
    const kept = settled(item.id)
    queue.retry(item.id)
    return kept
  }

  function cancel() {
    if (state.value !== 'uploading') return
    canceled.value = true
    forget()
  }

  function open() {
    if (!busy.value) input?.click()
  }

  const name = computed(() => file.value?.name ?? '')
  const announcement = computed(() => {
    if (state.value === 'uploading') return labels.t('uploading', { name: name.value })
    if (state.value === 'claiming') return labels.t('claiming', { name: name.value })
    if (state.value === 'done') return labels.t('done', { name: name.value })
    if (state.value === 'ready' && canceled.value) return labels.t('canceled')
    return ''
  })

  const onChange = (event: Event) => {
    const target = event.target as HTMLInputElement
    const picked = target.files?.[0]
    // Cleared, so picking the same file again fires a change.
    target.value = ''
    if (picked) void pick(picked)
  }

  const bind: UseUploadFieldReturn['bind'] = {
    root: computed(() => ({
      'data-upload': 'field',
      'data-state': state.value,
      'data-dragging': dragging.value || undefined,
      'aria-busy': busy.value || undefined,
      'onDragover': (event: DragEvent) => {
        event.preventDefault()
        dragging.value = true
      },
      'onDragleave': () => {
        dragging.value = false
      },
      'onDrop': (event: DragEvent) => {
        event.preventDefault()
        dragging.value = false
        const dropped = event.dataTransfer?.files?.[0]
        if (dropped) void pick(dropped)
      },
    })),
    label: computed(() => ({ 'id': ids.label, 'data-upload': 'label' })),
    input: computed(() => ({
      'ref': (element: unknown) => {
        input = element as HTMLInputElement | null
      },
      'id': ids.input,
      'type': 'file',
      'hidden': true,
      'accept': toValue(options.accept) || undefined,
      // Hidden behind the button, but named all the same: the field's label.
      'aria-labelledby': ids.label,
      'data-upload': 'input',
      'onChange': onChange,
    })),
    button: computed(() => ({
      'type': 'button',
      'data-upload': 'choose',
      'aria-labelledby': [ids.label, ids.button].join(' '),
      'id': ids.button,
      'aria-describedby': error.value ? `${ids.status} ${ids.error}` : ids.status,
      'aria-disabled': busy.value || undefined,
      'onClick': open,
    })),
    progress: computed(() => ({ 'data-upload': 'progress', 'max': 1, 'value': progress.value, 'aria-labelledby': ids.label, 'aria-valuetext': labels.t('progress', { percent: Math.round(progress.value * 100) }) })),
    cancel: computed(() => ({ 'type': 'button', 'data-upload': 'cancel', 'onClick': cancel })),
    retry: computed(() => ({
      'type': 'button',
      'data-upload': 'retry',
      // Nothing to send again: a field with no upload URL mutation.
      'hidden': current.value?.status !== 'error' || undefined,
      'aria-describedby': ids.error,
      'onClick': () => {
        void retry()
      },
    })),
    status: computed(() => ({ 'id': ids.status, 'role': 'status', 'aria-live': 'polite', 'data-upload': 'status' })),
    error: computed(() => ({ 'id': ids.error, 'role': 'alert', 'data-upload': 'error' })),
  }

  return { state, file, progress, storageId, error, announcement, pick, retry, cancel, open, labels, bind }
}
