import type { FunctionReference } from 'convex/server'
import { ref, type Ref } from 'vue'
import { useMutation } from './use-mutation'

/**
 * A Convex mutation that returns a one-time upload URL by calling
 * `ctx.storage.generateUploadUrl()` on the server. The mutation usually takes
 * no arguments, but extra args (e.g. an authorization check) are allowed as
 * long as it resolves to the upload URL string.
 *
 * @public
 */
export type GenerateUploadUrl = FunctionReference<'mutation', 'public', Record<string, never>, string>

/**
 * Options accepted by {@link useStorage}.
 *
 * @public
 */
export interface UseStorageOptions {
  /**
   * Optional hook run after the bytes are stored but before {@link VueStorage.upload}
   * resolves. Receives the freshly created `storageId` and the uploaded `File`.
   * Use it to persist the reference with your own mutation (e.g. attach the
   * `storageId` to a row). Any rejection propagates out of `upload`.
   */
  onUploaded?: (storageId: string, file: File) => unknown | Promise<unknown>
}

/**
 * The reactive interface returned by {@link useStorage}.
 *
 * @public
 */
export interface VueStorage {
  /**
   * Upload a single file to Convex storage. Resolves with the resulting
   * `storageId`, which you typically persist with a mutation (see
   * {@link UseStorageOptions.onUploaded}).
   *
   * @throws If generating the upload URL fails, the network upload fails, or
   * the {@link UseStorageOptions.onUploaded} hook rejects. The thrown error is
   * also assigned to {@link VueStorage.error}.
   */
  upload: (file: File) => Promise<string>
  /** `true` while an upload is in flight. */
  uploading: Ref<boolean>
  /** Upload progress between `0` and `1`, or `null` when the size is unknown. */
  progress: Ref<number | null>
  /** The error from the most recent failed upload, or `null`. */
  error: Ref<Error | null>
}

/**
 * POST a file to a Convex upload URL, reporting progress, and resolve with the
 * `storageId` returned by Convex. Uses `XMLHttpRequest` because it exposes
 * upload progress events that `fetch` does not.
 */
function postFile(
  url: string,
  file: File,
  onProgress: (value: number | null) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    xhr.upload.onprogress = (event) => {
      onProgress(event.lengthComputable ? event.loaded / event.total : null)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { storageId } = JSON.parse(xhr.responseText) as { storageId: string }
          resolve(storageId)
        }
        catch {
          reject(new Error(
            'Convex storage upload returned a malformed response. Expected JSON with a `storageId` field.',
          ))
        }
      }
      else {
        reject(new Error(`Convex storage upload failed with status ${xhr.status}.`))
      }
    }
    xhr.onerror = () => reject(new Error('Convex storage upload failed due to a network error.'))
    xhr.send(file)
  })
}

/**
 * Upload files to [Convex file storage](https://docs.convex.dev/file-storage)
 * with reactive `uploading` / `progress` / `error` state.
 *
 * It wraps the three-step Convex upload flow — generate a one-time upload URL
 * via your mutation, `POST` the bytes, and read back the `storageId` — behind a
 * single `upload(file)` call, so you don't re-implement (and mis-handle) it at
 * every call site. It adds no capability over calling {@link useMutation} plus
 * `fetch` yourself; it is purely an ergonomic wrapper.
 *
 * Reading a file back is a normal Convex query that calls `ctx.storage.getUrl`,
 * so use {@link useQuery} for downloads — there is no separate helper for that.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useStorage } from '#imports'
 * import { api } from '#backend/api'
 *
 * const { upload, uploading, progress, error } = useStorage(
 *   api.files.generateUploadUrl,
 *   { onUploaded: (storageId, file) => saveFile({ storageId, name: file.name }) },
 * )
 * const saveFile = useMutation(api.files.save)
 *
 * async function onChange(event: Event) {
 *   const file = (event.target as HTMLInputElement).files?.[0]
 *   if (file) await upload(file)
 * }
 * </script>
 * ```
 *
 * @param generateUploadUrl - A FunctionReference for the public mutation that
 * returns an upload URL via `ctx.storage.generateUploadUrl()`.
 * @param options - Optional {@link UseStorageOptions}.
 * @returns The reactive {@link VueStorage} interface.
 *
 * @public
 */
export function useStorage(
  generateUploadUrl: GenerateUploadUrl,
  options: UseStorageOptions = {},
): VueStorage {
  const requestUploadUrl = useMutation(generateUploadUrl)

  const uploading = ref(false)
  const progress = ref<number | null>(null)
  const error = ref<Error | null>(null)

  async function upload(file: File): Promise<string> {
    uploading.value = true
    progress.value = null
    error.value = null
    try {
      const url = await requestUploadUrl()
      const storageId = await postFile(url, file, value => (progress.value = value))
      if (options.onUploaded) await options.onUploaded(storageId, file)
      progress.value = 1
      return storageId
    }
    catch (caught) {
      const normalized = caught instanceof Error ? caught : new Error(String(caught))
      error.value = normalized
      throw normalized
    }
    finally {
      uploading.value = false
    }
  }

  return { upload, uploading, progress, error }
}

/** @public */
export const useConvexStorage = useStorage
