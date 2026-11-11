import { describe, expect, it, vi } from 'vitest'
import { useNuxtApp } from '#imports'
import { onPageOpen } from '../../src/runtime/vue/utils/page-open'

// What a status or access link opens with outside a component (a store, a
// plugin): never mid-hydration, where it would change what the server
// rendered before the browser took the page over.

describe('onPageOpen outside a component', () => {
  it('waits for hydration to end, then opens once', async () => {
    const nuxtApp = useNuxtApp()
    const open = vi.fn()
    nuxtApp.isHydrating = true
    try {
      onPageOpen(open)
      expect(open).not.toHaveBeenCalled()
    }
    finally {
      nuxtApp.isHydrating = false
    }
    await nuxtApp.callHook('app:suspense:resolve', nuxtApp.vueApp as never)
    await nuxtApp.callHook('app:suspense:resolve', nuxtApp.vueApp as never)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('opens at once on a page past hydration', () => {
    const open = vi.fn()
    onPageOpen(open)
    expect(open).toHaveBeenCalledTimes(1)
  })
})
