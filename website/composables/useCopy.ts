import { getCurrentScope, onScopeDispose, ref } from 'vue'

/** How the last copy went, for as long as it is worth saying. */
export type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Copy text to the clipboard and say how it went, then fall quiet after
 * `duration`. A blocked clipboard (an insecure origin, a denied permission)
 * reads `failed`, so the page can say so instead of doing nothing.
 */
export function useCopy(duration = 1600) {
  const state = ref<CopyState>('idle')
  let reset: ReturnType<typeof setTimeout> | undefined
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      state.value = 'copied'
    }
    catch {
      state.value = 'failed'
    }
    clearTimeout(reset)
    reset = setTimeout(() => (state.value = 'idle'), duration)
  }
  if (getCurrentScope()) onScopeDispose(() => clearTimeout(reset))
  return { state, copy }
}
