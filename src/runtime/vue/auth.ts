import type { AuthTokenFetcher } from 'convex/browser'
import { effectScope, inject, provide, ref, toValue, watch, watchEffect, type EffectScope, type InjectionKey, type MaybeRefOrGetter } from 'vue'
import type { ConvexVueClient } from './client'

/**
 * Reactive auth state provided by {@link provideConvexAuth}.
 *
 * @public
 */
export interface ConvexAuthState {
  isLoading: boolean
  isAuthenticated: boolean
}

export const ConvexAuthStateKey: InjectionKey<ConvexAuthState> = Symbol('ConvexAuthState')

/**
 * Access the Convex auth state injected by {@link provideConvexAuth}.
 *
 * Reads the current `isLoading` and `isAuthenticated` values. Throws if
 * `provideConvexAuth` has not been called in an ancestor component.
 *
 * @returns The current {@link ConvexAuthState}.
 *
 * @public
 */
export function useConvexAuth(): ConvexAuthState {
  const authContext = inject(ConvexAuthStateKey)
  if (authContext === undefined) {
    throw new Error(
      'Could not find Convex auth context. '
      + 'Ensure `provideConvexAuth` has been called in an ancestor component '
      + 'or that the Convex auth plugin is installed.',
    )
  }
  return authContext
}

/**
 * Options for {@link provideConvexAuth}.
 */
export interface ConvexAuthProviderOptions {
  client: ConvexVueClient
  useAuth: () => {
    isLoading: MaybeRefOrGetter<boolean>
    isAuthenticated: MaybeRefOrGetter<boolean>
    fetchAccessToken: AuthTokenFetcher
    authVersion?: MaybeRefOrGetter<unknown>
  }
}

/**
 * Wire an external auth provider into the Convex client and make auth state
 * available to all descendant components via {@link useConvexAuth}.
 *
 * Call this in a top-level layout component's `setup` function, passing the
 * auth provider's loading/authenticated flags and its token fetcher.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAuth } from '~/composables/useAuth'  // your auth provider
 *
 * const { client } = useNuxtApp().$convex
 * const authState = provideConvexAuth({ client, useAuth })
 * </script>
 * ```
 *
 * @param options - Auth integration options including the Convex client and
 *   an `useAuth` factory that returns loading state and a token fetcher.
 * @returns The reactive auth state.
 *
 * @public
 */
export function provideConvexAuth(options: ConvexAuthProviderOptions): ConvexAuthState {
  const authState = createConvexAuthState(options)
  provide(ConvexAuthStateKey, authState)
  return authState
}

/**
 * Build reactive {@link ConvexAuthState} and wire watchers between the
 * external auth provider and the Convex client, without calling `provide()`.
 *
 * Use this when you need to install the state at the Nuxt app level
 * (`nuxtApp.vueApp.provide`) rather than from a component's setup function.
 *
 * When `scope` is provided, all watchers are created inside that
 * {@link EffectScope} so callers can dispose them later.
 */
export function createConvexAuthState(
  options: ConvexAuthProviderOptions,
  scope?: EffectScope,
): ConvexAuthState {
  const { client, useAuth } = options
  const {
    isLoading: authProviderLoading,
    isAuthenticated: authProviderAuthenticated,
    fetchAccessToken,
    authVersion: authProviderVersion,
  } = useAuth()

  const isAuthProviderLoading = () => toValue(authProviderLoading)
  const isAuthProviderAuthenticated = () => toValue(authProviderAuthenticated)
  const currentAuthProviderVersion = () => toValue(authProviderVersion)

  const isConvexAuthenticated = ref<boolean | null>(null)

  const authState = {
    get isLoading() {
      return isConvexAuthenticated.value === null
    },
    get isAuthenticated() {
      return isAuthProviderAuthenticated() && (isConvexAuthenticated.value ?? false)
    },
  }

  const register = () => {
    // When auth provider goes back to loading, reset Convex auth state.
    watch(
      isAuthProviderLoading,
      (loading) => {
        if (loading && isConvexAuthenticated.value !== null) {
          isConvexAuthenticated.value = null
        }
      },
    )

    // When auth provider becomes not-authenticated, reflect it.
    watch(
      () => [isAuthProviderLoading(), isAuthProviderAuthenticated()],
      ([loading, authenticated]) => {
        if (!loading && !authenticated && isConvexAuthenticated.value !== false) {
          isConvexAuthenticated.value = false
        }
      },
    )

    // Set auth on the Convex client when authenticated.
    watchEffect((onCleanup) => {
      const providerLoading = isAuthProviderLoading()
      const providerAuthenticated = isAuthProviderAuthenticated()
      const authVersion = currentAuthProviderVersion()

      void authVersion

      if (providerLoading || !providerAuthenticated) {
        return
      }

      client.setAuth(fetchAccessToken, (backendIsAuthenticated) => {
        isConvexAuthenticated.value = backendIsAuthenticated
      })

      onCleanup(() => {
        client.clearAuth()
        isConvexAuthenticated.value = null
      })
    })
  }

  if (scope) {
    scope.run(register)
  }
  else {
    register()
  }

  return authState
}

/**
 * Create a fresh {@link EffectScope} and build a Convex auth state inside it.
 * The scope is returned so the caller can `.stop()` it on teardown.
 */
export function createScopedConvexAuthState(
  options: ConvexAuthProviderOptions,
): { state: ConvexAuthState, scope: EffectScope } {
  const scope = effectScope(true)
  const state = createConvexAuthState(options, scope)
  return { state, scope }
}
