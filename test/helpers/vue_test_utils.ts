import { defineComponent, h, provide } from 'vue'
import { ConvexClientKey, type ConvexVueClient } from '../../src/runtime/vue/client'

/**
 * Mount a child component that uses a composable, with a ConvexVueClient
 * provided by a parent wrapper. Needed because Vue's inject() only looks UP
 * the component tree, not at the current component.
 */
export function withConvex<T>(client: ConvexVueClient, composableFn: () => T) {
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

  return { Wrapper, getResult: () => result }
}
