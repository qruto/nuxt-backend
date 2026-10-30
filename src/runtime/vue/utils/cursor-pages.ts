import { computed, nextTick, ref, watch, type ComputedRef } from 'vue'

/** What a cursor-paged read answers about its page: whether it is the last, and where the next one starts. */
export interface CursorPage {
  isDone: boolean
  continueCursor: string
}

/** Paging through one listing by cursor, as a composable returns it. */
export interface CursorPages {
  /** Where the page in view starts: `null` for the first. What the read is asked for. */
  cursor: ComputedRef<string | null>
  /** The page in view, from 1. */
  page: ComputedRef<number>
  /** Whether a later page exists. */
  hasMore: ComputedRef<boolean>
  /** Whether an earlier page exists. */
  hasPrevious: ComputedRef<boolean>
  /** Show the next page once it is read (no-op on the last). */
  next: () => Promise<void>
  /** Show the previous page once it is read (no-op on the first). */
  previous: () => Promise<void>
  /** Back to the first page. */
  reset: () => void
}

/**
 * Where each page of a listing starts: the first at the top, every other
 * one after the page before. A cursor is a place in one listing (what is
 * listed, how many per page, for whom: `listing` says it as a key), so the
 * stack is kept with its listing's key and reads as the first page under
 * any other: never a cursor of another listing, not even for the moment
 * before a watcher would clear it.
 *
 * `answer` is the page the read answered, `loading` whether it is being
 * read; both are read lazily, so the read itself may be made after this,
 * from `cursor`. `next` and `previous` resolve once the page asked for is
 * read.
 */
export function useCursorPages(listing: () => string, answer: () => CursorPage | null | undefined, loading: () => boolean): CursorPages {
  const key = computed(listing)
  const isLoading = computed(loading)
  const stack = ref<{ listing: string, cursors: Array<string | null> }>({ listing: key.value, cursors: [null] })
  const cursors = computed(() => (stack.value.listing === key.value ? stack.value.cursors : [null]))
  const turnTo = (next: Array<string | null>) => {
    stack.value = { listing: key.value, cursors: next }
  }

  /** Resolve once the page asked for is read: the next tick, then until it stops loading. */
  async function settled(): Promise<void> {
    await nextTick()
    if (!isLoading.value) return
    await new Promise<void>((resolve) => {
      const stop = watch(isLoading, (now) => {
        if (now) return
        stop()
        resolve()
      })
    })
  }

  return {
    cursor: computed(() => cursors.value.at(-1) ?? null),
    page: computed(() => cursors.value.length),
    hasMore: computed(() => {
      const current = answer()
      return Boolean(current && !current.isDone)
    }),
    hasPrevious: computed(() => cursors.value.length > 1),
    next: async () => {
      const current = answer()
      if (!current || current.isDone || isLoading.value) return
      turnTo([...cursors.value, current.continueCursor])
      await settled()
    },
    previous: async () => {
      if (cursors.value.length <= 1) return
      turnTo(cursors.value.slice(0, -1))
      await settled()
    },
    reset: () => turnTo([null]),
  }
}
