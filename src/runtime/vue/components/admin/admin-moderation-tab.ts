import type { FunctionReference } from 'convex/server'
import { computed, ref, useId } from 'vue'
import type { ModerationFlag } from '../../../../convex/integrations/ai/moderation'
import { formatBillingDate } from '../../composables/billing-format'
import { useLabels } from '../../composables/use-labels'
import { useCursorPages } from '../../utils/cursor-pages'
import { absentQuery, useLiveQuery } from '../../utils/live-query'
import { useBackendNamespace } from '../../utils/namespace'

// The Moderation tab's state, headless: `AdminModeration.vue` renders it.
// What the safety classifier flagged, newest first or only the escalated
// flags, a page at a time, through `backend/ai.ts`'s
// `listModerationFlags`, which answers administrators only.

/** The function of `ai.api` the Moderation tab reads. */
interface ModerationApiRefs {
  listModerationFlags?: FunctionReference<'query', 'public', { paginationOpts: { numItems: number, cursor: string | null }, escalated?: boolean }, { page: ModerationFlag[], isDone: boolean, continueCursor: string } | null>
}

/** How many flags a page shows. */
const PAGE_SIZE = 25

/**
 * The Moderation tab, as state.
 *
 * @internal
 */
export function useModerationTab() {
  const api = useBackendNamespace<ModerationApiRefs>('ai', 'AdminModeration')
  const { t, errorMessage, locale } = useLabels('admin')
  const id = useId()
  const escalated = ref(false)
  // The page is read after `pages` exists: it reads its cursor from it.
  let list = absentQuery<{ page: ModerationFlag[], isDone: boolean, continueCursor: string } | null>()
  const pages = useCursorPages(() => `${escalated.value}:${PAGE_SIZE}`, () => list.data.value, () => list.isLoading.value)
  if (api.listModerationFlags) {
    list = useLiveQuery(api.listModerationFlags, () => ({ paginationOpts: { numItems: PAGE_SIZE, cursor: pages.cursor.value }, ...(escalated.value ? { escalated: true } : {}) }))
  }

  return {
    id,
    t,
    errorMessage,
    escalated,
    pages,
    flags: computed(() => list.data.value?.page),
    /** The read answered that this caller is no administrator. */
    isRefused: computed(() => list.data.value === null),
    isLoading: computed(() => list.isLoading.value),
    error: computed(() => list.error.value),
    when: (at: number) => formatBillingDate(at, { dateStyle: 'medium', timeStyle: 'short' }, locale.value),
    /** What was checked, in the app's words: its stage and its id. */
    what: (flag: ModerationFlag) => [flag.stage, flag.subject].filter(Boolean).join(' · '),
    outcome: (flag: ModerationFlag) => t(flag.blocked ? 'moderation.blocked' : 'moderation.passed'),
  }
}
