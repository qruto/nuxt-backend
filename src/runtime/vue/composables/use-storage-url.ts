import type { FunctionReference } from 'convex/server'
import { toValue, type MaybeRefOrGetter, type ShallowRef } from 'vue'
import { useQuery } from './use-query'
import type { StorageId } from './use-upload'

/**
 * A `getUrl` query: takes `{ storageId }` and returns the file's served URL,
 * or `null` if the file no longer exists (`await ctx.storage.getUrl(id)`).
 *
 * @public
 */
export type GetStorageUrl = FunctionReference<
  'query',
  'public',
  { storageId: StorageId },
  string | null
>

/**
 * Reactively resolve the served URL for a Convex stored file.
 *
 * Thin wrapper over {@link useQuery} that handles the common ergonomics of
 * serving stored files: it accepts a reactive storage id and automatically
 * skips the query (returning `undefined`) while the id is `null`/`undefined`,
 * so you can bind it straight to an id ref without juggling `'skip'`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useStorageUrl } from '#imports'
 * import { api } from '#backend/api'
 *
 * const { storageId } = useUpload(api.images.generateUploadUrl)
 * const url = useStorageUrl(api.images.getUrl, storageId)
 * </script>
 *
 * <template>
 *   <img v-if="url" :src="url">
 * </template>
 * ```
 *
 * @param getUrl - A `FunctionReference` for the public `getUrl` query.
 * @param storageId - The storage id to resolve. Accepts a ref, computed, or
 *   getter; `null`/`undefined` skips the query.
 * @returns A shallow ref of the served URL: `string | null` once loaded
 *   (`null` if the file is gone), or `undefined` while loading or skipped.
 *
 * @public
 */
export function useStorageUrl(
  getUrl: GetStorageUrl,
  storageId: MaybeRefOrGetter<StorageId | string | null | undefined>,
): ShallowRef<string | null | undefined> {
  return useQuery(getUrl, () => {
    const id = toValue(storageId)
    return id ? { storageId: id as StorageId } : 'skip'
  })
}

/** @public */
export const useConvexStorageUrl = useStorageUrl
