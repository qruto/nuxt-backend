// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- the private names' declarations, for every program that compiles this file as written
/// <reference path="./base-modules.d.ts" />
import type * as Base from 'nuxt-convex-module/client'
import * as base from '#backend-test-utils/base-client'
import { provideMockOnCurrentApp } from './install.js'

// What `backendTestAliases()` puts in place of `nuxt-convex-module/client`
// (and `/vue`): the base module's own entry, every export of it, with each
// composable that reads the client, the function tree or the auth state
// first providing the mock on the calling component's app. The composables
// themselves are the real ones over the mock's client (install.ts). A
// plain `mount()` whose tree calls one of these gets the mock this way;
// `mountSuspended` gets it from the Nuxt app, and `backendMockProvides()`
// covers any other plain mount. Typed against the public entry, so the
// declarations an app sees resolve.

export * from '#backend-test-utils/base-client'

/** `composable`, after the mock is provided where it will look. */
const provided = <F extends (...args: never[]) => unknown>(composable: F): F =>
  ((...args: Parameters<F>) => {
    provideMockOnCurrentApp()
    return composable(...args)
  }) as F

export const useConvex: typeof Base.useConvex = provided(base.useConvex)
export const useConvexAuth: typeof Base.useConvexAuth = provided(base.useConvexAuth)
export const useConvexConnectionState: typeof Base.useConvexConnectionState = provided(base.useConvexConnectionState)
export const useQuery: typeof Base.useQuery = provided(base.useQuery)
export const useConvexQuery: typeof Base.useConvexQuery = provided(base.useConvexQuery)
export const useQuery_experimental: typeof Base.useQuery_experimental = provided(base.useQuery_experimental)
export const useQueries: typeof Base.useQueries = provided(base.useQueries)
export const useConvexQueries: typeof Base.useConvexQueries = provided(base.useConvexQueries)
export const usePaginatedQuery: typeof Base.usePaginatedQuery = provided(base.usePaginatedQuery)
export const useConvexPaginatedQuery: typeof Base.useConvexPaginatedQuery = provided(base.useConvexPaginatedQuery)
export const usePaginatedQuery_experimental: typeof Base.usePaginatedQuery_experimental = provided(base.usePaginatedQuery_experimental)
export const usePreloadedQuery: typeof Base.usePreloadedQuery = provided(base.usePreloadedQuery)
export const useMutation: typeof Base.useMutation = provided(base.useMutation)
export const useConvexMutation: typeof Base.useConvexMutation = provided(base.useConvexMutation)
export const useAction: typeof Base.useAction = provided(base.useAction)
export const useConvexAction: typeof Base.useConvexAction = provided(base.useConvexAction)
export const useStorageUrl: typeof Base.useStorageUrl = provided(base.useStorageUrl)
export const useConvexStorageUrl: typeof Base.useConvexStorageUrl = provided(base.useConvexStorageUrl)
export const useUpload: typeof Base.useUpload = provided(base.useUpload)
export const useConvexUpload: typeof Base.useConvexUpload = provided(base.useConvexUpload)
export const useUploadQueue: typeof Base.useUploadQueue = provided(base.useUploadQueue)
export const useConvexUploadQueue: typeof Base.useConvexUploadQueue = provided(base.useConvexUploadQueue)
