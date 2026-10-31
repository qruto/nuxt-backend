import type { Probe } from './authorization-policies'

/**
 * A probe that gets through where its policy says it must not, known and
 * owned by the plan item that closes it.
 */
export interface Gap {
  /** `module:export`, as in the policy registry. */
  fn: string
  probe: Probe
  /** The policy rule the probe breaks, as `refusingRule` names it. */
  rule: string
  /** The plan item that closes it. */
  closedBy: string
}

// The ratchet: every probe that gets through where its policy says it must
// not, each with the plan item that closes it. The first run found 65 such
// gaps; the checkout fix and the fresh authorization reads closed every one.
// The suite fails while a closed gap stays listed, and on any new gap that is
// not listed here, so the list only ever shrinks: it is empty, and a gap
// added to it needs the rule it breaks, the item that closes it, and a
// reason it cannot be closed now.
export const GAPS: Gap[] = []
