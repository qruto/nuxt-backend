import type { FindingEntries } from './types'

/** Workspaces: the page an invitation email links to. */
export const WORKSPACES_FINDINGS = {
  'invitation-path': { title: 'Invitation route' },
} as const satisfies FindingEntries
