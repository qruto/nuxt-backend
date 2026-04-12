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
