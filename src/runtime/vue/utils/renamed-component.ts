import { defineComponent, h, type Component } from 'vue'

const warned = new Set<string>()

/**
 * A development-only stand-in for a component registered under a name 0.2
 * hid: it renders `target`, the component the new name points at, with every
 * attribute and slot passed through, and warns once per process, naming the
 * replacement. The module registers these only in dev, so a production build
 * never knows the old name.
 *
 * @internal
 */
export function renamedComponent(from: string, to: string, target: Component) {
  return defineComponent({
    name: from,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      if (!warned.has(from)) {
        warned.add(from)
        console.warn(
          `[nuxt-backend] <${from}> is <${to}> now. It renders only in development, and a production build `
          + `no longer knows the name: rename it: https://nuxt-backend.dev/docs/ship/releases/upgrade#the-surface-says-backend-never-a-provider`,
        )
      }
      return () => h(target, attrs, slots)
    },
  })
}
