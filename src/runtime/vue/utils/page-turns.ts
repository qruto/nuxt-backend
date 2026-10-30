import { nextTick, ref, type Ref } from 'vue'
import { focusedIn, focusStranded, returnFocus } from './focus-return'

/** What the pager reads from a paged list: `useOrders()`, `useUsage()`. */
export interface PagedList {
  hasMore: Readonly<Ref<boolean>>
  hasPrevious: Readonly<Ref<boolean>>
  isLoading: Readonly<Ref<boolean>>
  next: () => Promise<void>
  previous: () => Promise<void>
}

/** Which way a page turns: `newer` is `previous()`, `older` is `next()`. */
export type PageTurn = 'newer' | 'older'

/** The words of a pager: its two buttons, and what the pressed one says while its page loads. */
export interface PageTurnLabels {
  newer: string
  older: string
  loading: string
}

/**
 * The newer and older buttons of a paged list (`ListPager.vue` renders them),
 * hooked on `data-<family>`. A pressed button is busy while its page loads:
 * `aria-disabled` rather than `disabled`, so it keeps focus, saying so
 * (`labels.loading`), and a second press of either does nothing. `disabled`
 * stays for a direction with no page left; when a turn reaches the end, the
 * button pressed becomes unavailable under focus, and focus moves to the
 * other button instead of dropping to the page.
 */
export function usePageTurns(list: PagedList, family: string) {
  const root = ref<HTMLElement | null>(null)
  /** The turn whose page is loading, `null` when none was pressed. */
  const turning: Ref<PageTurn | null> = ref(null)
  const busy = () => list.isLoading.value || turning.value !== null

  async function turn(which: PageTurn): Promise<void> {
    if (busy()) return
    const pressed = focusedIn(root.value)
    turning.value = which
    try {
      await (which === 'older' ? list.next() : list.previous())
    }
    catch {
      // The list holds the failure in its `error`, which the component shows.
    }
    finally {
      turning.value = null
    }
    if (!pressed) return
    await nextTick()
    if (!focusStranded(pressed)) return
    const other = root.value?.querySelector<HTMLButtonElement>(`[data-${family}="${which === 'older' ? 'newer' : 'older'}"]`)
    if (other && !other.disabled) returnFocus(other)
  }

  return { list, family, root, turning, busy, turn }
}

/** A paged list's pager, as `<ListPager>` renders it. */
export type PageTurns = ReturnType<typeof usePageTurns>
