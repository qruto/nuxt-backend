// The invite code or access link token a tab keeps between the check
// (`useInvite`, the `/invite` page) and the sign-in that hands it over
// (`useLoginFlow`): in the tab's session storage (`tab-keep.ts`), so it lasts
// as long as the tab and never reaches a server until the code check sends
// it.

import { takeFragment, tabKeep } from './tab-keep'

const kept = tabKeep('nuxt-backend:invite')

/** The code or token this tab keeps, or `null`. */
export function keptInvite(): string | null {
  return kept.read()
}

/** Keep a code or token for this tab's next sign-in. */
export function keepInvite(code: string): void {
  kept.keep(code)
}

/** Drop the kept code or token: after a sign-up used it, or a check found it dead. */
export function forgetInvite(): void {
  kept.drop()
}

/**
 * An access link's token from the address's fragment (`/invite#<token>`),
 * stripped from the address so it is neither bookmarked nor shared on.
 * `null` without one.
 */
export function takeInviteFromAddress(): string | null {
  return takeFragment()
}
