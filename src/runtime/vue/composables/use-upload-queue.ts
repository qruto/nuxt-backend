import { computed, ref, type Ref } from 'vue'
import { useConvex } from '../client'
import { uploadFile, type GenerateUploadUrl, type StorageId } from './use-upload'

/**
 * Lifecycle status of a single item in an upload queue.
 *
 * @public
 */
export type UploadItemStatus = 'pending' | 'uploading' | 'success' | 'error'

/**
 * A single entry in the queue managed by {@link useUploadQueue}.
 *
 * @public
 */
export interface UploadQueueItem {
  /** Stable id for this queue entry (not the storage id). */
  id: string
  /** The file or blob being uploaded. */
  file: Blob
  /** Current upload status. */
  status: UploadItemStatus
  /** Upload progress for this item, from `0` to `1`. */
  progress: number
  /** The storage id once the upload succeeds, or `null`. */
  storageId: StorageId | null
  /** The error if this item failed, or `null`. */
  error: Error | null
}

/**
 * Options for {@link useUploadQueue}.
 *
 * @public
 */
export interface UseUploadQueueOptions {
  /** Maximum number of uploads to run at once. Defaults to `3`. */
  concurrency?: number
  /** Called when an individual item finishes uploading. */
  onItemSuccess?: (storageId: StorageId, item: UploadQueueItem) => void | Promise<void>
  /** Called when an individual item fails. */
  onItemError?: (error: Error, item: UploadQueueItem) => void
  /** Called once every queued item has settled (succeeded or failed). */
  onComplete?: (items: UploadQueueItem[]) => void
}

/** Accepted inputs to {@link VueUploadQueue.enqueue}. */
type EnqueueInput = Blob | Blob[] | FileList | null | undefined

/**
 * The reactive queue returned by {@link useUploadQueue}.
 *
 * @public
 */
export interface VueUploadQueue {
  /** Reactive list of queued items, in insertion order. */
  items: Readonly<Ref<UploadQueueItem[]>>
  /** Add one or more files to the queue; uploading starts automatically. */
  enqueue: (files: EnqueueInput) => void
  /** `true` while any item is pending or uploading. */
  isUploading: Readonly<Ref<boolean>>
  /** Aggregate progress across all items, from `0` to `1`. */
  progress: Readonly<Ref<number>>
  /** Number of items waiting to start. */
  pendingCount: Readonly<Ref<number>>
  /** Number of items currently uploading. */
  activeCount: Readonly<Ref<number>>
  /** Abort all in-flight uploads (queued items stay `pending`). */
  cancel: () => void
  /** Remove an item by id, aborting it first if it is uploading. */
  remove: (id: string) => void
  /** Abort everything and empty the queue. */
  clear: () => void
}

function normalizeFiles(input: EnqueueInput): Blob[] {
  if (!input) return []
  if (input instanceof Blob) return [input]
  if (Array.isArray(input)) return input
  return Array.from(input)
}

let queueItemId = 0
function nextQueueItemId(): string {
  return `upload-${++queueItemId}`
}

/**
 * Upload many files to Convex file storage with bounded concurrency and
 * per-item reactive progress.
 *
 * Built on the same flow as {@link useUpload}, but manages a queue: call
 * {@link VueUploadQueue.enqueue} with one or more files (or a `FileList` from
 * a multi-file `<input>`) and the queue uploads up to `concurrency` at a time,
 * exposing per-item and aggregate progress.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useUploadQueue, useMutation } from '#imports'
 * import { api } from '#backend/api'
 *
 * const saveImage = useMutation(api.images.save)
 * const { items, enqueue, progress, isUploading } = useUploadQueue(
 *   api.images.generateUploadUrl,
 *   { concurrency: 4, onItemSuccess: storageId => saveImage({ storageId }) },
 * )
 *
 * function onPick(event: Event) {
 *   enqueue((event.target as HTMLInputElement).files)
 * }
 * </script>
 *
 * <template>
 *   <input type="file" multiple @change="onPick">
 *   <progress v-if="isUploading" :value="progress" />
 *   <ul>
 *     <li v-for="item in items" :key="item.id">
 *       {{ item.status }} — {{ Math.round(item.progress * 100) }}%
 *     </li>
 *   </ul>
 * </template>
 * ```
 *
 * @param generateUploadUrl - A `FunctionReference` for the public
 *   `generateUploadUrl` mutation.
 * @param options - Optional {@link UseUploadQueueOptions}.
 * @returns A {@link VueUploadQueue}.
 *
 * @public
 */
export function useUploadQueue(
  generateUploadUrl: GenerateUploadUrl,
  options: UseUploadQueueOptions = {},
): VueUploadQueue {
  const convex = useConvex()
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 3))
  const items = ref<UploadQueueItem[]>([])
  const controllers = new Map<string, AbortController>()

  const activeCount = computed(
    () => items.value.filter(item => item.status === 'uploading').length,
  )
  const pendingCount = computed(
    () => items.value.filter(item => item.status === 'pending').length,
  )
  const isUploading = computed(() => activeCount.value > 0 || pendingCount.value > 0)
  const progress = computed(() => {
    if (items.value.length === 0) return 0
    const total = items.value.reduce((sum, item) => sum + item.progress, 0)
    return total / items.value.length
  })

  function pump(): void {
    if (typeof XMLHttpRequest === 'undefined') return
    let slots = concurrency - activeCount.value
    for (const item of items.value) {
      if (slots <= 0) break
      if (item.status !== 'pending') continue
      slots--
      void run(item)
    }
  }

  async function run(item: UploadQueueItem): Promise<void> {
    item.status = 'uploading'
    const controller = new AbortController()
    controllers.set(item.id, controller)

    try {
      const url = await convex.mutation(generateUploadUrl, {})
      const storageId = await uploadFile({
        url,
        file: item.file,
        signal: controller.signal,
        onProgress: (value) => {
          item.progress = value
        },
      })
      item.storageId = storageId
      item.progress = 1
      item.status = 'success'
      await options.onItemSuccess?.(storageId, item)
    }
    catch (caught) {
      const failure = caught instanceof Error ? caught : new Error(String(caught))
      item.error = failure
      item.status = 'error'
      options.onItemError?.(failure, item)
    }
    finally {
      controllers.delete(item.id)
      if (pendingCount.value === 0 && activeCount.value === 0) {
        options.onComplete?.(items.value)
      }
      else {
        pump()
      }
    }
  }

  function enqueue(files: EnqueueInput): void {
    const incoming = normalizeFiles(files)
    if (incoming.length === 0) return
    items.value.push(
      ...incoming.map((file): UploadQueueItem => ({
        id: nextQueueItemId(),
        file,
        status: 'pending',
        progress: 0,
        storageId: null,
        error: null,
      })),
    )
    pump()
  }

  function cancel(): void {
    for (const controller of controllers.values()) {
      controller.abort()
    }
  }

  function remove(id: string): void {
    controllers.get(id)?.abort()
    controllers.delete(id)
    items.value = items.value.filter(item => item.id !== id)
  }

  function clear(): void {
    cancel()
    controllers.clear()
    items.value = []
  }

  // `computed` returns a `ComputedRef`, which is already assignable to the
  // `Readonly<Ref<…>>` shape declared on `VueUploadQueue` — no cast needed.
  return {
    items,
    enqueue,
    isUploading,
    progress,
    pendingCount,
    activeCount,
    cancel,
    remove,
    clear,
  }
}

/** @public */
export const useConvexUploadQueue = useUploadQueue
