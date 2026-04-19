import type { InjectionKey } from 'vue'
import { inject } from 'vue'
import type { ConvexClient } from 'convex/browser'

/**
 * Vue injection key for the Convex client.
 *
 * In React, the Convex client is provided via React Context
 * (`ConvexContext` + `ConvexProvider`). In Vue, we use the standard
 * provide/inject mechanism with a typed `InjectionKey` symbol.
 *
 * This key is framework-agnostic — any Vue application (including Nuxt)
 * can provide a `ConvexClient` under this key.
 */
export const ConvexClientKey: InjectionKey<ConvexClient> = Symbol('ConvexClient')

/**
 * Get the {@link ConvexClient} from the current Vue component tree.
 *
 * Equivalent of the React `useConvex()` hook which reads from
 * `ConvexContext`. In Vue, this uses `inject()` with the
 * {@link ConvexClientKey} symbol.
 *
 * @returns The active {@link ConvexClient} instance.
 * @throws If no client has been provided in the component tree.
 *
 * @public
 */
export function useConvex(): ConvexClient {
  const client = inject(ConvexClientKey)
  if (!client) {
    throw new Error(
      'Could not find Convex client! `useConvex` must be used in a component tree '
      + 'where the Convex client has been provided. '
      + 'In Nuxt, ensure the nuxt-backend module is installed.',
    )
  }
  return client
}
