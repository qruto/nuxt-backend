import { shallowRef, watchEffect, type ShallowRef } from 'vue'

/**
 * Bridge an arbitrary subscription source into Vue reactivity.
 *
 * Useful when integrating external pub/sub APIs that follow the
 * `{ getCurrentValue, subscribe }` pattern. The returned shallow ref updates
 * whenever the subscription fires.
 *
 * @internal
 */
export function useSubscription<T>({
  getCurrentValue,
  subscribe,
}: {
  getCurrentValue: () => T
  subscribe: (callback: () => void) => () => void
}): ShallowRef<T> {
  const value = shallowRef(getCurrentValue()) as ShallowRef<T>

  watchEffect((onCleanup) => {
    // Read current value synchronously (might have changed since last render).
    value.value = getCurrentValue()

    const unsubscribe = subscribe(() => {
      value.value = getCurrentValue()
    })

    onCleanup(unsubscribe)
  })

  return value
}
