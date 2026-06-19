import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createApp, defineComponent, h } from 'vue'
import {
  type BackendApi,
  provideBackendApi,
  useBackendApi,
  useBackendNamespace,
} from '../../src/runtime/vue/provide'

const api: BackendApi = {
  billing: { generateCheckoutLink: { _ref: 'billing' } },
  email: { getEmailStatus: { _ref: 'email' } },
}

describe('useBackendApi / useBackendNamespace', () => {
  it('returns undefined outside an injection context', () => {
    expect(useBackendApi()).toBeUndefined()
    expect(useBackendNamespace('billing')).toBeUndefined()
  })

  it('exposes the provided api to descendant setups', async () => {
    let injectedApi: BackendApi | undefined
    let billing: unknown
    let missing: unknown

    const Child = defineComponent({
      setup() {
        injectedApi = useBackendApi()
        billing = useBackendNamespace('billing')
        missing = useBackendNamespace('missing')
        return () => h('div')
      },
    })
    const Parent = defineComponent({
      setup() {
        provideBackendApi(api)
        return () => h(Child)
      },
    })

    await mountSuspended(Parent)

    expect(injectedApi).toBe(api)
    expect(billing).toBe(api.billing)
    expect(missing).toBeUndefined()
  })

  it('provides at the app level when given an app instance', () => {
    let billing: unknown
    const Root = defineComponent({
      setup() {
        billing = useBackendNamespace('billing')
        return () => h('div')
      },
    })

    const app = createApp(Root)
    provideBackendApi(api, app)
    const el = document.createElement('div')
    app.mount(el)

    expect(billing).toBe(api.billing)

    app.unmount()
  })
})
