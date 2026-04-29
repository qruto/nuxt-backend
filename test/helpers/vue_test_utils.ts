import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, provide } from 'vue'
import { ConvexClientKey, type ConvexVueClient } from '../../src/runtime/vue/client'

/**
 * Mount a composable inside a Vue component tree that provides a
 * ConvexVueClient. Pass `tick: true` to flush one additional tick after mount
 * so reactive effects (e.g. watchEffect) can read initial values. For more
 * ticks after reactive updates, call `await nextTick()` directly.
 */
export async function mountWithConvex<T>(
  client: ConvexVueClient,
  composableFn: () => T,
  options: { tick?: boolean } = {},
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
      return () => h(Child)
    },
  })

  const wrapper = await mountSuspended(Wrapper)
  if (options.tick) await nextTick()

  return { wrapper, result }
}
