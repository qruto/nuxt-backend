import { computed, type ComputedRef } from 'vue'
import { useBetterAuth } from 'nuxt-convex-module/better-auth/client'
import { useDeletionNotice } from '../composables/use-deletion-notice'
import { useMaintenanceNotice } from '../composables/use-flags'

// Whether the frame of a ready-made page places `<BackendNotices>`: while a
// notice that holds for every page applies, an administrator's visit, the
// app's maintenance or the account's scheduled deletion. Read cheaply in the frame's setup, so a page with no
// notice stays its `<main>` alone, one root element (a page transition
// needs one); the region then shows every notice that applies.

/**
 * Whether a notice the frame answers for applies now: the visit from the
 * session as the base module holds it, the maintenance notice from the
 * flags and the deletion from the account, live in the browser (none
 * without a `backend/flags.ts` or the account's `getAccountDeletion`).
 */
export function useFrameNotices(): ComputedRef<boolean> {
  const { session } = useBetterAuth()
  const maintenance = useMaintenanceNotice()
  const { visible: deletion } = useDeletionNotice()
  return computed(() => Boolean((session?.value?.data?.session as { impersonatedBy?: unknown } | undefined)?.impersonatedBy) || maintenance.value !== null || deletion.value)
}
