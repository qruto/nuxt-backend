/**
 * Tools to integrate Convex into Vue applications.
 *
 * This module contains:
 * 1. {@link ConvexVueClient}, a client for using Convex in Vue.
 * 2. {@link ConvexClientKey}, a Vue injection key for providing the client.
 * 3. {@link Authenticated}, {@link Unauthenticated} and {@link AuthLoading} helper auth components.
 * 4. Composables {@link useQuery}, {@link useMutation}, {@link useAction} and more.
 *
 * @module
 */

// Client
export {
  ConvexVueClient,
  ConvexClientKey,
  useConvex,
  type Watch,
  type WatchQueryOptions,
  type VueMutationOptions,
  type ConvexVueClientOptions,
} from './client'

export type {
  AuthTokenFetcher,
  ConnectionState,
  OptimisticUpdate,
  QueryJournal,
  QueryOptions,
} from 'convex/browser'

// Re-export convex types for convenience
export type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
  OptionalRestArgs,
  ArgsAndOptions,
} from 'convex/server'

export type { Value } from 'convex/values'

// Queries
export {
  useConvexQueries,
  useQueries,
  type RequestForQueries,
} from './use_queries'

// Query
export {
  useQuery,
  useConvexQuery,
  type UseQueryResult,
  type OptionalRestArgsOrSkip,
} from './use_query'

// Mutation
export {
  useMutation,
  useConvexMutation,
  type VueMutation,
} from './use_mutation'

// Public alias matching Convex's mutation option naming.
export type { VueMutationOptions as MutationOptions } from './client'

// Action
export {
  useAction,
  useConvexAction,
  type VueAction,
} from './use_action'

// Paginated Query
export * from './use_paginated_query'

// Connection State
export { useConvexConnectionState } from './use_connection_state'

// Auth
export {
  useConvexAuth,
  provideConvexAuth,
  createConvexAuthState,
  createScopedConvexAuthState,
  ConvexAuthStateKey,
  type ConvexAuthState,
  type ConvexAuthProviderOptions,
} from './auth'

// Auth Helpers
export { Authenticated, Unauthenticated, AuthLoading } from './auth_helpers'

// Hydration / SSR
export {
  usePreloadedQuery,
  type Preloaded,
} from './hydration'

// Subscription utility (internal)
export { useSubscription } from './use_subscription'
