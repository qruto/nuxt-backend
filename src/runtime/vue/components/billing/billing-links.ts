import { ref } from 'vue'

/**
 * The billing links' one slot: the link's words, which are the app's. It
 * receives whether the session is being created, so the words can say so.
 */
export interface BillingLinkSlots {
  default: (context: { pending: boolean }) => unknown
}

/**
 * Run one click's provider session: ignore clicks while one is in flight,
 * and hand a refusal to the `error` listener instead of an unhandled
 * rejection — the link has no place of its own to show it.
 *
 * @internal
 */
export function useClickSession(open: () => Promise<unknown>, emit: (event: 'error', error: unknown) => void) {
  const pending = ref(false)
  const onClick = async (event: MouseEvent) => {
    event.preventDefault()
    if (pending.value) return
    pending.value = true
    try {
      await open()
    }
    catch (error) {
      emit('error', error)
    }
    finally {
      pending.value = false
    }
  }
  return { pending, onClick }
}
