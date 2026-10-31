// Content reports' shared vocabulary, runtime-neutral (no Vue, no Convex
// runtime): the reasons a person reports content for, which the backend
// checks, the notice form lists and the Reports tab names.

/** Why someone reports content: the one-click reasons, and the notice form's legal ones. */
export type ReportReason = 'abuse' | 'sexual' | 'violence' | 'spam' | 'intimate' | 'child_abuse' | 'illegal' | 'other'

/** Every reason, in the order the notice form lists them. */
export const REPORT_REASONS: readonly ReportReason[] = ['illegal', 'intimate', 'child_abuse', 'abuse', 'sexual', 'violence', 'spam', 'other']

/** How long an intimate-image removal request may wait: 48 hours (the TAKE IT DOWN Act). */
export const REMOVAL_DEADLINE_MS = 48 * 60 * 60 * 1000

/** Where the appeal token travels in the `report` page's address: its fragment, never sent to a server. */
export const APPEAL_FRAGMENT = 'appeal='
