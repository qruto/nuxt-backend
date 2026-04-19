import type { ConvexClient, ConvexHttpClient } from 'convex/browser'
import { useNuxtApp } from '#app'

/**
 * Access the backend client instance.
 * Returns `ConvexClient` on the client (WebSocket, real-time)
 * and `ConvexHttpClient` on the server (stateless HTTP).
 */
export function useBackend(): ConvexClient | ConvexHttpClient {
  return useNuxtApp().$backend as ConvexClient | ConvexHttpClient
}

/**
 * Nuxt auto-imported `useConvex` composable.
 *
 * Re-exports the Vue-layer `useConvex` which uses `inject()` to retrieve
 * the `ConvexClient`. This is the recommended way to access the Convex
 * client in components and composables — it mirrors React's `useConvex()`.
 */
export { useConvex } from '../vue/client'
