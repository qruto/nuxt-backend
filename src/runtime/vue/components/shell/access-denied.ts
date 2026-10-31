import type { AccessDeniedReason } from '../../utils/access-rules'

/** What each of `<AccessDenied>`'s slots receives. */
export interface AccessDeniedSlotContext {
  /** The rule the person failed, when the page guard refused them; `undefined` for any other 403. */
  reason: AccessDeniedReason | undefined
  /** The page they asked for: where signing in with another account returns to. */
  path: string
  /** Where the home link goes. */
  home: string
  /** The signed-in person's email, or `null`. */
  email: string | null
  /** Whether signing out is on its way. */
  pending: boolean
  /** Sign out, then go to the sign-in page with `?redirect=` back to `path`. */
  switchAccount: () => Promise<void>
}

/** `<AccessDenied>`'s slots, each one region's content. */
export interface AccessDeniedSlots {
  /** The heading's words, inside its `h1`. */
  title: (context: AccessDeniedSlotContext) => unknown
  /** Why, and who is signed in. */
  message: (context: AccessDeniedSlotContext) => unknown
  /** The ways on: home, another workspace, another account. */
  actions: (context: AccessDeniedSlotContext) => unknown
}

/** A plain left click, which the app's router can take instead of the browser. */
export const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
