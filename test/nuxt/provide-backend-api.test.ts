import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'
import { createApp } from 'vue'
import { useAccessPhase } from '../../src/runtime/vue/composables/use-access'
import { type BackendApi, provideBackendApi, useApiNamespace } from '../../src/runtime/vue/utils/namespace'

// What the packaged plugin provides: codegen's runtime `api`, which is
// `anyApi` (a proxy that answers every name), narrowed to the modules
// `_generated/api.d.ts` lists. Without the list, an app with no
// `backend/access.ts` asked its deployment for `access:getAccessPhase`.

/** Run `read` inside an app given `api` the way the plugin gives it. */
function within<T>(read: () => T, modules?: readonly string[]): T {
  const app = createApp({ render: () => null })
  provideBackendApi(anyApi as unknown as BackendApi, app, modules)
  return app.runWithContext(read)
}

describe('provideBackendApi', () => {
  it('answers only the namespaces codegen listed', () => {
    expect(within(() => useApiNamespace('billing'), ['account', 'billing'])).toBeDefined()
    expect(within(() => useApiNamespace('access'), ['account', 'billing'])).toBeUndefined()
  })

  it('lets a composable whose file the app lacks fall back instead of calling the deployment', () => {
    const { phase, isPublic, isLoading, error } = within(() => useAccessPhase(), ['account', 'billing'])
    expect(phase.value).toBe('public')
    expect(isPublic.value).toBe(true)
    expect(isLoading.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('answers no namespace for an empty list', () => {
    expect(within(() => useApiNamespace('access'), [])).toBeUndefined()
    expect(within(() => useApiNamespace('billing'), [])).toBeUndefined()
  })
})
