import { api } from '#backend/api'

// Cookie sessions: the refresh token lives in an httpOnly cookie, pages
// render signed in on the server, and the `convex-auth` page middleware is
// registered. `signIn` lists every function that may start a session.
export default setupConvexAuthNuxt({
  refreshSession: api.auth.refreshSession,
  signOut: api.auth.signOut,
  isAuthenticated: api.auth.isAuthenticated,
  signIn: [
    api.auth.signInWithUsernamePassword,
    api.auth.signUpWithUsernamePassword,
  ],
})
