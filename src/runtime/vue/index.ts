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
// Derive additional shared types from the official Convex React integration
// (avoids duplication and keeps our public API types in sync with upstream).
// Use "import type" here so the specifier is erased in JS output; no runtime dep
// on convex/react (and thus no "react" peer) even if this barrel is loaded.
// Internals (composables) use local defs; barrel provides the canonical types.
import type {
  UsePaginatedQueryOptions,
  UsePaginatedQueryObjectReturnType,
  UsePaginatedQueryResult,
  UsePaginatedQueryReturnType,
  PaginatedQueryReference,
  PaginatedQueryArgs,
  PaginatedQueryItem,
  // UseQueryResult provided via composables (local def for internals; see use-query.ts)
  // OptionalRestArgsOrSkip provided via composables (derived)
  // PaginationStatus already re-exported via browser or composables
} from 'convex/react'

export {
  ConvexVueClient,
  ConvexClientKey,
  useConvex,
  type Watch,
  type PaginatedWatch,
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

export type {
  UsePaginatedQueryOptions,
  UsePaginatedQueryObjectReturnType,
  UsePaginatedQueryResult,
  UsePaginatedQueryReturnType,
  PaginatedQueryReference,
  PaginatedQueryArgs,
  PaginatedQueryItem,
}

// Queries
export {
  useConvexQueries,
  useQueries,
  type RequestForQueries,
} from './composables/use-queries'

// Query
export {
  useQuery,
  useQuery_experimental,
  useConvexQuery,
  type UseQueryResult,
  type OptionalRestArgsOrSkip,
} from './composables/use-query'

// Mutation
export {
  useMutation,
  useConvexMutation,
  type VueMutation,
} from './composables/use-mutation'

// Public alias matching Convex's mutation option naming.
export type { VueMutationOptions as MutationOptions } from './client'

// Action
export {
  useAction,
  useConvexAction,
  type VueAction,
} from './composables/use-action'

// Paginated Query
export * from './composables/use-paginated-query'

// Connection State
export { useConvexConnectionState } from './composables/use-connection-state'

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
export { Authenticated, Unauthenticated, AuthLoading } from './auth/helpers'

// Better Auth service
export { useAuth, type UseAuthService, type AuthSession } from './auth/use-auth'
export type { AuthClient } from './auth/client'

// Hydration / SSR
export {
  usePreloadedQuery,
  type Preloaded,
} from './hydration'
export { usePreloadedAuthQuery } from './auth/hydration'

// Subscription utility (internal)
export { useSubscription } from './composables/use-subscription'
