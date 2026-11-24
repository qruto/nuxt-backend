import type { ComputedRef } from 'vue'
// nuxt-convex-module 0.15.2 publishes this entry with an empty declaration
// file, so it is typed here, by what the package calls of it. `@ts-ignore`
// rather than `@ts-expect-error`: a release that types it needs no change.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- the entry's declaration file is empty in nuxt-convex-module 0.15.2
import * as entry from 'nuxt-convex-module/convex-auth/client'

/** What the base module's Convex Auth client provides the app, as the package calls it. */
export interface ConvexAuthBindings {
  /** Adopt a session a sign-in opened, and end the current one. */
  useAuthActions: () => { setSession: (tokens: { accessToken: string }) => Promise<void>, signOut: () => Promise<void> }
  /** The current access token, or `null` signed out. */
  useAuthToken: () => ComputedRef<string | null>
}

export const { useAuthActions, useAuthToken } = entry as unknown as ConvexAuthBindings
