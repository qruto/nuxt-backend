import { makeFunctionReference } from 'convex/server'
import { setupConvexAuthNuxt } from 'nuxt-convex-module/convex-auth/server'

// The Convex Auth server of an app that has no `server/convex-auth.ts` of
// its own: the functions `setupAuth` builds in `backend/auth.ts`. The base
// module mounts the auth routes from it and refreshes the session before
// each render. An app's own `server/convex-auth.ts` takes its place.

export default setupConvexAuthNuxt({
  refreshSession: makeFunctionReference<'mutation'>('auth:refreshSession') as never,
  signOut: makeFunctionReference<'mutation'>('auth:signOut') as never,
  isAuthenticated: makeFunctionReference<'query'>('auth:isAuthenticated') as never,
  signIn: [makeFunctionReference<'action'>('auth:signIn') as never],
})
