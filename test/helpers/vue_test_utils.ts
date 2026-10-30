import { mountSuspended } from '@nuxt/test-utils/runtime'
import { type FunctionReference, getFunctionName } from 'convex/server'
import { vi } from 'vitest'
import { defineComponent, h, nextTick, provide } from 'vue'
import { ConvexClientKey, type ConvexVueClient } from 'nuxt-convex-module/client'

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

/**
 * Make the client's reads of `query` fail with `error`, as a refused or
 * crashed query does: every read, or those whose args `when` accepts. Other
 * reads stay live. Undone by `vi.restoreAllMocks()`. The function it returns
 * answers every failing read again, as a new result from the server does —
 * with the same error, or with `next` from then on.
 */
export function failClientQuery(
  client: ConvexVueClient,
  query: FunctionReference<'query'>,
  error: Error,
  when: (args: Record<string, unknown>) => boolean = () => true,
): (next?: Error) => void {
  let current = error
  const listeners = new Set<() => void>()
  const watchQuery = client.watchQuery.bind(client)
  vi.spyOn(client, 'watchQuery').mockImplementation(((ref: typeof query, ...rest: unknown[]) => {
    if (getFunctionName(ref) !== getFunctionName(query) || !when(rest[0] as Record<string, unknown>)) return (watchQuery as (...args: unknown[]) => unknown)(ref, ...rest)
    return {
      onUpdate: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      localQueryResult: () => {
        throw current
      },
      localQueryLogs: () => undefined,
      journal: () => undefined,
    }
  }) as never)
  return (next) => {
    if (next) current = next
    for (const listener of listeners) listener()
  }
}
