import { setupConvexAuth } from '@convex-dev/auth/server'
import { setupUsernamePassword } from '@convex-dev/auth/methods/username-password/server'
import { components, internal } from './_generated/api'

// The session functions the Nuxt side calls (server/convex-auth.ts), and one
// sign-in method: a username and a password, with no email to send. Add
// others (an emailed link, OAuth, passkeys) as Convex Auth's docs show.
const auth = setupConvexAuth({ component: components.auth })

export const { signOut, refreshSession, isAuthenticated } = auth

export const { signUpWithUsernamePassword, signInWithUsernamePassword, changePassword }
  = setupUsernamePassword(auth, {
    component: components.authPassword,
    usernameComponent: components.authUsername,
  }).attachUserCallbacks({ createUser: internal.users.create })
