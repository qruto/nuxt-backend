import type { FunctionReference } from 'convex/server'
import { computed, inject, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import type { MintedShareLink, ShareLinkState } from '../../../convex/integrations/storage'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'

export type { MintedShareLink, ShareLinkState } from '../../../convex/integrations/storage'

/** The share-link functions re-exported from your `backend/storage.ts`. */
export interface ShareLinkApiRefs {
  getShareLink?: FunctionReference<'query', 'public', { table: string, id: string }, ShareLinkState | null>
  enableShareLink?: FunctionReference<'mutation', 'public', { table: string, id: string }, MintedShareLink>
  revokeShareLink?: FunctionReference<'mutation', 'public', { table: string, id: string }, null>
}

export interface UseShareLinkOptions {
  /** Override the injected `api.storage` namespace. */
  api?: ShareLinkApiRefs
}

export interface UseShareLinkReturn {
  /** Whether the row has a live link, in every open tab. `false` while it is read, and for a caller who may not share it. */
  shared: ComputedRef<boolean>
  /** When the link was turned on, epoch ms; `null` without one. */
  sharedAt: ComputedRef<number | null>
  /** The link, right after `enable()` in this tab; `null` before, after `revoke()` (here or anywhere), and after a reload. The token is shown once. */
  url: Readonly<Ref<string | null>>
  /** `true` while the link is first read. */
  isLoading: ComputedRef<boolean>
  /** `true` while `enable()` or `revoke()` runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, else why the link could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Mint a link, replacing any earlier one. Resolves with `{ token, url }`; rejects on failure (`forbidden` `cannot_share`). */
  enable: () => Promise<MintedShareLink>
  /** Turn the link off: a page that holds it reads `null` from then on. Rejects on failure. */
  revoke: () => Promise<void>
}

/**
 * One row's share link: whether it has a live one and since when, read
 * live, and the actions that turn it on (or mint a new one) and off,
 * through `getShareLink`, `enableShareLink` and `revokeShareLink` of
 * `backend/storage.ts`. The table must be marked with
 * `storage.shareable(table, { path, canShare })`. The link itself is shown
 * once, in the tab that minted it: only its hash is stored.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const props = defineProps<{ stripId: string }>()
 * const { shared, url, enable, revoke, isPending } = useShareLink('strips', () => props.stripId)
 * </script>
 * ```
 */
export function useShareLink(table: MaybeRefOrGetter<string>, id: MaybeRefOrGetter<string | null | undefined>, options: UseShareLinkOptions = {}): UseShareLinkReturn {
  const api = useBackendNamespace<ShareLinkApiRefs>('storage', 'useShareLink', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const target = computed(() => {
    const row = toValue(id)
    return row ? { table: toValue(table), id: row } : null
  })
  const read = api.getShareLink
    ? useLiveQuery(api.getShareLink, () => (signedOut.value || !target.value ? 'skip' : target.value))
    : absentQuery<ShareLinkState | null>()
  const runEnable = api.enableShareLink ? useMutation(api.enableShareLink) : null
  const runRevoke = api.revokeShareLink ? useMutation(api.revokeShareLink) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  // The link this tab minted: another row, or the link turned off anywhere, forgets it.
  const url = ref<string | null>(null)
  const sharedAt = computed(() => (signedOut.value ? null : read.data.value?.sharedAt ?? null))
  watch(target, () => {
    url.value = null
  })
  watch(() => read.data.value, (link) => {
    if (link === null) url.value = null
  })

  const mutationOrThrow = <T>(fn: T | null, name: string): T => {
    if (fn) return fn
    throw new Error(`[nuxt-backend] useShareLink() needs \`${name}\` re-exported from setupStorage() in backend/storage.ts (\`export const { ${name} } = storage.api\`), or pass \`{ api }\`.`)
  }
  const current = () => {
    if (!target.value) throw new Error('[nuxt-backend] useShareLink(): no row id yet.')
    return target.value
  }

  return {
    shared: computed(() => sharedAt.value !== null),
    sharedAt,
    url,
    isLoading: computed(() => !signedOut.value && target.value !== null && read.isLoading.value),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : read.error.value)),
    enable: () => run(async () => {
      const minted = await mutationOrThrow(runEnable, 'enableShareLink')(current())
      url.value = minted.url
      return minted
    }),
    revoke: () => run(async () => {
      await mutationOrThrow(runRevoke, 'revokeShareLink')(current())
      url.value = null
    }),
  }
}
