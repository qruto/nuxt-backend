// Content reports' shared vocabulary, runtime-neutral (no Vue, no Convex
// runtime): the reasons a person reports content for, which the backend
// checks, the notice form lists and the Reports tab names.

/** Why someone reports content: the one-click reasons, and the notice form's legal ones. */
export type ReportReason = 'abuse' | 'sexual' | 'violence' | 'spam' | 'intimate' | 'child_abuse' | 'illegal' | 'other'

/** Every reason, in the order the notice form lists them. */
export const REPORT_REASONS: readonly ReportReason[] = ['illegal', 'intimate', 'child_abuse', 'abuse', 'sexual', 'violence', 'spam', 'other']

/** The longest a report's or a notice's details may be, in characters. */
export const REPORT_DETAILS_MAX = 4000

/** How long an intimate-image removal request may wait: 48 hours (the TAKE IT DOWN Act). */
export const REMOVAL_DEADLINE_MS = 48 * 60 * 60 * 1000

/** Where the appeal token travels in the `report` page's address: its fragment, never sent to a server. */
export const APPEAL_FRAGMENT = 'appeal='

/**
 * The appeal token an address's fragment carries (`#appeal=<token>`), or
 * `null` for none. A fragment that is not percent-encoded right (`%E0`,
 * from a link cut short) carries none either, rather than throwing.
 */
export function appealTokenOf(hash: string): string | null {
  let fragment: string
  try {
    fragment = decodeURIComponent(hash.replace(/^#/, '')).trim()
  }
  catch {
    return null
  }
  return fragment.startsWith(APPEAL_FRAGMENT) ? fragment.slice(APPEAL_FRAGMENT.length) || null : null
}
