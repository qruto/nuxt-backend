import { computed, ref, toValue, useId, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { type GenerateUploadUrl, useUpload } from 'nuxt-convex-module/client'
import { type BackendError, failureOf } from '../utils/backend-error'
import { useBackendNamespace } from '../utils/namespace'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn } from './use-labels'

/** Where an upload field is: waiting for a file, sending it, waiting for the claim, kept, refused by the deployment, or failed on the way. */
export type UploadFieldState = 'ready' | 'uploading' | 'claiming' | 'done' | 'refused' | 'error'

export interface UseUploadFieldOptions {
  /** Your mutation that keeps the file (it calls `storage.claim`). A refusal it throws is the field's. */
  claim: (storageId: string) => Promise<unknown>
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
 * dropping it), upload it with the base module's `useUpload` through the
 * upload URL `setupStorage` mints, then hand the storage id to your
 * `claim`, where the deployment checks it. State, actions and bindings, so
 * markup of your own stays accessible; `<UploadField>` is this with the
 * package's markup.
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
  const uploader = generateUploadUrl ? useUpload(generateUploadUrl) : null
  const id = useId() ?? `upload-${Math.random().toString(36).slice(2)}`
  const ids = { label: `${id}-label`, input: `${id}-input`, button: `${id}-button`, status: `${id}-status`, error: `${id}-error` }

  const phase = ref<UploadFieldState>('ready')
  const file = ref<File | null>(null)
  const storageId = ref<string | null>(null)
  const error = ref<BackendError | null>(null)
  const canceled = ref(false)
  const dragging = ref(false)
  let input: HTMLInputElement | null = null

  const progress = computed(() => uploader?.progress.value ?? 0)
  const busy = computed(() => phase.value === 'uploading' || phase.value === 'claiming')

  function fail(failure: BackendError) {
    error.value = failure
    phase.value = isRefusal(failure) ? 'refused' : 'error'
    options.onError?.(failure)
  }

  async function pick(picked: File): Promise<string | null> {
    if (busy.value) return null
    file.value = picked
    error.value = null
    canceled.value = false
    if (!uploader) {
      fail(failureOf(new Error('[nuxt-backend] <UploadField> needs `generateUploadUrl` re-exported from setupStorage() in backend/storage.ts (`export const { generateUploadUrl } = storage.api`).')))
      return null
    }
    phase.value = 'uploading'
    const uploaded = await uploader.upload(picked)
    if (!uploaded) {
      if (canceled.value) {
        phase.value = 'ready'
        return null
      }
      fail(failureOf(uploader.error.value ?? new Error('Upload failed')))
      return null
    }
    phase.value = 'claiming'
    try {
      await options.claim(uploaded)
    }
    catch (cause) {
      fail(failureOf(cause))
      return null
    }
    storageId.value = uploaded
    phase.value = 'done'
    options.onClaimed?.(uploaded)
    return uploaded
  }

  function cancel() {
    if (phase.value !== 'uploading') return
    canceled.value = true
    uploader?.cancel()
  }

  function open() {
    if (!busy.value) input?.click()
  }

  const name = computed(() => file.value?.name ?? '')
  const announcement = computed(() => {
    if (phase.value === 'uploading') return labels.t('uploading', { name: name.value })
    if (phase.value === 'claiming') return labels.t('claiming', { name: name.value })
    if (phase.value === 'done') return labels.t('done', { name: name.value })
    if (phase.value === 'ready' && canceled.value) return labels.t('canceled')
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
      'data-state': phase.value,
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
    status: computed(() => ({ 'id': ids.status, 'role': 'status', 'aria-live': 'polite', 'data-upload': 'status' })),
    error: computed(() => ({ 'id': ids.error, 'role': 'alert', 'data-upload': 'error' })),
  }

  return { state: computed(() => phase.value), file, progress, storageId, error, announcement, pick, cancel, open, labels, bind }
}
