/**
 * The rename map: the public names a release renamed, reshaped or removed,
 * each tied to the Upgrade page section that explains it. Every API-shaped
 * name the page's Gone columns list (a composable, a component, a factory,
 * a type, a constant) that the package no longer has is in here. Coding
 * agents read it as `skills/nuxt-backend/references/renames.json` and
 * `skills/nuxt-backend-upgrade/references/upgrade.md`, which `pnpm generate`
 * writes from this list, so an agent that remembers an old name finds the
 * new one in the installed package.
 *
 * It is reference data only. `nuxt-backend upgrade` rewrites none of an
 * app's code (it repairs the scaffold and runs the package's data
 * migrations), so an entry is never a codemod: the edit is the reader's.
 *
 * While the Upgrade page lists a section, it has entries here:
 * test/docs/agent-guidance.test.ts fails while a section has none, while an
 * entry names something its section does not, and while a Gone column lists
 * a removed API name no entry carries. The previews of `main` before 0.2.0
 * renamed, reshaped and removed names of their own: those entries left with
 * their sections, which the Upgrade page at the v0.2.1 tag still lists.
 */

/**
 * What happened to a name: `renamed`, the same thing under a new name;
 * `reshaped`, the same name called or read differently, `to` showing the new
 * shape; `removed`, gone, `to` naming what to use instead, or null when
 * nothing takes its place.
 */
export type RenameChange = 'renamed' | 'reshaped' | 'removed'

/** One entry of the rename map. */
export interface Rename {
  /** The old name or call, exactly as the Upgrade page spells it. */
  from: string
  /** The new name or call, as the Upgrade page spells it; null when nothing replaces it. */
  to: string | null
  change: RenameChange
  /** The heading of the Upgrade page section that explains it, without the `## `. */
  section: string
  /** What else changes, when the new name is not a drop-in replacement. */
  note?: string
}

/** The Upgrade page, which explains every entry in one of its sections. */
export const UPGRADE_PAGE = 'https://nuxt-backend.dev/docs/ship/releases/upgrade'

/** The Upgrade page as 0.2.1 published it: every change between the previews of `main`, before 0.2.0. */
export const PREVIEW_UPGRADE_PAGE = 'https://github.com/qruto/nuxt-backend/blob/v0.2.1/website/content/docs/05.ship/6.releases/4.upgrade.md'

/** A heading's anchor on the docs site: lowercase words joined by `-`, punctuation and code ticks dropped. */
export function headingAnchor(heading: string): string {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
}

/** The link to the Upgrade page section a heading names. */
export function sectionUrl(section: string): string {
  return `${UPGRADE_PAGE}#${headingAnchor(section)}`
}

const MEMBER_TICKETS = 'Members bring friends with a ticket of their own, and the waitlist records the campaign'
const COLD_BALANCE = 'A job joins on a balance never read'
const REPORTS_LEGAL = 'Report forms send notices, and the legal pages fill your own'
const TUNNEL = 'Browser error reports go through a tunnel on the app\'s own origin'
const UI_TOKENS = 'The packaged UI reads its faces, lines and shadows from tokens'

/**
 * Every rename, newest section first, as the Upgrade page orders them: one
 * `const` per section heading above the list, and its entries in it.
 */
export const RENAMES: readonly Rename[] = [
  // 0.3: member tickets, and the waitlist's campaign source.
  { from: 'access.invites.create with a label per member', to: 'access.memberTickets({ uses, lifetime })', change: 'reshaped', section: MEMBER_TICKETS, note: 're-export its `api` (`getMemberTicket`, `issueMemberTicket`) and read it with `useMemberTicket()`; drop the table of links the app kept' },
  { from: 'useWaitlist({ source })', to: 'useWaitlist({ source, campaign })', change: 'reshaped', section: MEMBER_TICKETS, note: 'the address\'s `utm_source` and `utm_campaign` follow the source; `campaign: false` records the source alone' },

  // A job joins on a balance never read, and reads it as it starts.
  { from: 'jobs.enqueue', to: 'jobs.enqueue', change: 'reshaped', section: COLD_BALANCE, note: 'a balance never read no longer refuses `not_synced`: the job joins, and its first step reads the balance or fails `insufficient_credits`; a balance read with no credit meter is still refused `not_ready`' },

  // The report form is a composable: a notice by default, the one-click report as a mode.
  { from: 'useMutation(api.admin.reportContent)', to: 'useReportForm(subject, { mode: \'quick\' })', change: 'reshaped', section: REPORTS_LEGAL, note: 'or `useReportForm(subject)` for a notice (DSA Art. 16) through `sendNotice`, with the fields it requires' },
  // The managed tunnel needs a newer SDK: the peer range moves.
  { from: '@sentry/nuxt', to: '@sentry/nuxt@^11.10.0', change: 'reshaped', section: TUNNEL, note: 'the peer range; an older SDK still reports, straight to the ingest, and the build and `doctor` warn' },
  // One attribute marks every packaged component, in place of a list of families.
  { from: '[data-auth=\'form\'], [data-pricing=\'table\'], [data-admin]', to: '[data-backend]', change: 'reshaped', section: UI_TOKENS, note: 'the outermost element of every packaged component and page; `<AppShell>` marks its own controls, not its root' },
]
