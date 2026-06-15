import type { FunctionReference } from 'convex/server'
import type { GenericId } from 'convex/values'
import { ref, shallowRef, type Ref } from 'vue'
import { useConvex } from '../client'

/**
 * A `generateUploadUrl` mutation: takes no arguments and returns a one-time
 * Convex upload URL string (`await ctx.storage.generateUploadUrl()`).
 *
 * @public
 */
export type GenerateUploadUrl = FunctionReference<
  'mutation',
  'public',
  Record<string, never>,
  string
>

/**
 * A Convex file storage id (`Id<'_storage'>`), branded so it is directly
 * assignable to mutation/query args validated with `v.id('_storage')`.
 *
 * @public
 */
export type StorageId = GenericId<'_storage'>

/**
 * Options for the low-level {@link uploadFile} helper.
 *
 * @public
 */
export interface UploadFileOptions {
  /** The one-time Convex upload URL from a `generateUploadUrl` mutation. */
  url: string
  /** The file or blob to upload. */
  file: Blob
  /** Receives upload progress as a fraction from `0` to `1`. */
  onProgress?: (progress: number) => void
  /** Abort signal to cancel the in-flight upload. */
  signal?: AbortSignal
}

/**
 * Upload a single file to a Convex upload URL, resolving to its storage id.
 *
 * Low-level building block used by {@link useUpload} and
 * {@link useUploadQueue}. Uses `XMLHttpRequest` so real upload progress and
 * cancellation are available — `fetch` cannot report request-body progress.
 *
 * Browser-only: throws if no `XMLHttpRequest` global is available (e.g. during
 * SSR).
 *
 * @param options - {@link UploadFileOptions}.
 * @returns A promise of the new {@link StorageId}.
 *
 * @public
 */
export function uploadFile(options: UploadFileOptions): Promise<StorageId> {
  const { url, file, onProgress, signal } = options

  if (typeof XMLHttpRequest === 'undefined') {
    return Promise.reject(
      new Error('uploadFile can only run in the browser (no XMLHttpRequest available).'),
    )
  }

  return new Promise<StorageId>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload aborted.', 'AbortError'))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    if (file.type) {
      xhr.setRequestHeader('Content-Type', file.type)
    }

    const onAbort = (): void => xhr.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = (): void => signal?.removeEventListener('abort', onAbort)

    xhr.upload.onprogress = (event: ProgressEvent): void => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total)
      }
    }

    xhr.onload = (): void => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { storageId } = JSON.parse(xhr.responseText) as { storageId: string }
          onProgress?.(1)
          resolve(storageId as StorageId)
        }
        catch {
          reject(new Error(`Convex upload returned an unexpected response: ${xhr.responseText}`))
        }
      }
      else {
        reject(new Error(`Convex upload failed with status ${xhr.status}: ${xhr.responseText}`))
      }
    }

    xhr.onerror = (): void => {
      cleanup()
      reject(new Error('Network error during Convex file upload.'))
    }

    xhr.onabort = (): void => {
      cleanup()
      reject(new DOMException('Upload aborted.', 'AbortError'))
    }

    xhr.send(file)
  })
}

/**
 * Options for {@link useUpload}.
 *
 * @public
 */
export interface UseUploadOptions {
  /** Called with upload progress as a fraction from `0` to `1`. */
  onProgress?: (progress: number) => void
  /** Called once the file is stored, with the new storage id and the file. */
  onSuccess?: (storageId: StorageId, file: Blob) => void | Promise<void>
  /** Called if generating the upload URL or the upload itself fails. */
  onError?: (error: Error, file: Blob) => void
}

/**
 * The reactive uploader returned by {@link useUpload}.
 *
 * @public
 */
export interface VueUpload {
  /**
   * Upload a file or blob, resolving to its {@link StorageId}.
   *
   * Resolves to `null` (instead of throwing) if the upload fails or is called
   * outside the browser — inspect {@link VueUpload.error} for the reason.
   */
  upload: (file: Blob) => Promise<StorageId | null>
  /** `true` while an upload is in flight. */
  isUploading: Readonly<Ref<boolean>>
  /** Upload progress of the current/last upload, from `0` to `1`. */
  progress: Readonly<Ref<number>>
  /** The error from the most recent failed upload, or `null`. */
  error: Readonly<Ref<Error | null>>
  /** The storage id from the most recent successful upload, or `null`. */
  storageId: Readonly<Ref<StorageId | null>>
  /** Abort the in-flight upload, if any. */
  cancel: () => void
  /** Reset `progress`, `error`, and `storageId` back to their initial values. */
  reset: () => void
}

/**
 * Upload files to Convex file storage from a component, with reactive
 * progress, error, and cancellation state.
 *
 * Wraps the standard Convex flow — call a `generateUploadUrl` mutation, `POST`
 * the file to the returned URL, and read back the storage id — and exposes it
 * as reactive refs. Pass the resulting {@link StorageId} to your own mutation
 * to persist it in your data model.
 *
 * Uploads are client-only: calling `upload()` during SSR resolves to `null`
 * and sets {@link VueUpload.error}.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useUpload, useMutation } from '#imports'
 * import { api } from '#backend/api'
 *
 * const saveImage = useMutation(api.images.save)
 * const { upload, isUploading, progress, error } = useUpload(
 *   api.images.generateUploadUrl,
 *   { onSuccess: storageId => saveImage({ storageId }) },
 * )
 *
 * async function onPick(event: Event) {
 *   const file = (event.target as HTMLInputElement).files?.[0]
 *   if (file) await upload(file)
 * }
 * </script>
 *
 * <template>
 *   <input type="file" :disabled="isUploading" @change="onPick">
 *   <progress v-if="isUploading" :value="progress" />
 *   <p v-if="error">{{ error.message }}</p>
 * </template>
 * ```
 *
 * @param generateUploadUrl - A `FunctionReference` for the public
 *   `generateUploadUrl` mutation.
 * @param options - Optional {@link UseUploadOptions} callbacks.
 * @returns A {@link VueUpload}.
 *
 * @public
 */
export function useUpload(
  generateUploadUrl: GenerateUploadUrl,
  options: UseUploadOptions = {},
): VueUpload {
  const convex = useConvex()
  const isUploading = ref(false)
  const progress = ref(0)
  const error = shallowRef<Error | null>(null)
  const storageId = shallowRef<StorageId | null>(null)
  let controller: AbortController | null = null

  async function upload(file: Blob): Promise<StorageId | null> {
    if (typeof XMLHttpRequest === 'undefined') {
      const browserOnly = new Error('useUpload().upload() can only run in the browser.')
      error.value = browserOnly
      options.onError?.(browserOnly, file)
      return null
    }

    controller = new AbortController()
    isUploading.value = true
    progress.value = 0
    error.value = null

    try {
      const url = await convex.mutation(generateUploadUrl, {})
      const id = await uploadFile({
        url,
        file,
        signal: controller.signal,
        onProgress: (value) => {
          progress.value = value
          options.onProgress?.(value)
        },
      })
      storageId.value = id
      progress.value = 1
      await options.onSuccess?.(id, file)
      return id
    }
    catch (caught) {
      const failure = caught instanceof Error ? caught : new Error(String(caught))
      error.value = failure
      options.onError?.(failure, file)
      return null
    }
    finally {
      isUploading.value = false
      controller = null
    }
  }

  function cancel(): void {
    controller?.abort()
  }

  function reset(): void {
    progress.value = 0
    error.value = null
    storageId.value = null
  }

  // Refs are returned directly; the `VueUpload` type presents them as readonly
  // so consumers treat them as state to read, not mutate.
  return {
    upload,
    isUploading,
    progress,
    error,
    storageId,
    cancel,
    reset,
  }
}

/** @public */
export const useConvexUpload = useUpload
