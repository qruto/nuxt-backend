import { computed, type ComputedRef } from 'vue'
import { useBetterAuth } from 'nuxt-convex-module/better-auth/client'

/**
 * Who reads, as one key: the signed-in account and its active workspace.
 * What the server scopes to the caller (a cursor, a page of the billing
 * provider's history) belongs to one reader: when the key changes, another
 * reader starts again from the first page. Must be called during setup.
 *
 * @internal
 */
export function useReaderKey(): ComputedRef<string> {
  const { session } = useBetterAuth()
  return computed(() => {
    const data = session?.value?.data as { user?: { id?: string }, session?: { activeOrganizationId?: string | null } } | null | undefined
    return `${data?.user?.id ?? ''}:${data?.session?.activeOrganizationId ?? ''}`
  })
}
