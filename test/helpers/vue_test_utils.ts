import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, provide } from 'vue'
import { ConvexClientKey, type ConvexVueClient } from '../../src/runtime/vue/client'

/**
 * Mount a composable inside a Vue component tree that provides a
 * ConvexVueClient. Pass `tick: true` to flush one additional tick after mount
 * so reactive effects (e.g. watchEffect) can read initial values. For more
 * ticks after reactive updates, call `await nextTick()` directly.
 *
 * Pass `expectSetupThrow: true` when the composable is expected to throw
 * synchronously during `setup` (used by negative-path tests asserting on
 * invalid arguments). A throwing `setup` aborts before the render function is
 * returned, which makes Vue emit a benign "Component is missing template or
 * render function" warning; this flag installs a scoped `warnHandler` that
 * swallows just that one message while letting every other warning through, so
 * the assertion stays clean without hiding real problems.
 *
 * Pass `provide` to supply extra `provide()` bindings in the wrapper (above the
 * composable's component), e.g. to inject `ConvexAuthStateKey` for auth-gated
 * composables — the callback runs inside the wrapper's `setup`, so call Vue's
 * `provide()` directly there.
 */
export async function mountWithConvex<T>(
  client: ConvexVueClient,
  composableFn: () => T,
  options: { tick?: boolean, expectSetupThrow?: boolean, provide?: () => void } = {},
) {
  let result!: T

  const Child = defineComponent({
    setup() {
      result = composableFn()
      return () => h('div')
    },
  })

  const Wrapper = defineComponent({
    setup() {
      provide(ConvexClientKey, client)
      options.provide?.()
      return () => h(Child)
    },
  })

  const mountOptions = options.expectSetupThrow
    ? {
        global: {
          config: {
            warnHandler: (msg: string) => {
              if (msg.includes('Component is missing template or render function')) {
                return
              }
              console.warn(msg)
            },
          },
        },
      }
    : undefined

  const wrapper = await mountSuspended(Wrapper, mountOptions)
  if (options.tick) await nextTick()

  return { wrapper, result }
}
