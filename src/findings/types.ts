import type { CapabilityName } from '../capabilities/types.js'

/**
 * A group of findings, one file of src/findings/ each. Every group belongs to
 * one app capability (src/capabilities/registry.ts), the name `doctor --only` selects.
 */
export type FindingGroup = 'deployment' | 'auth' | 'email' | 'notifications' | 'billing' | 'ai' | 'scaffold' | 'site' | 'protection' | 'monitoring' | 'analytics'

/** What the registry knows about one finding id, apart from its group. */
export interface FindingEntry {
  /** The label the CLI and the DevTools panel print. */
  title: string
  /**
   * `'fail'`: a `warn` of this finding is a failure under `doctor --prod`, a
   * degradation a live product can't run with.
   */
  prod?: 'fail'
  /** `doctor --fix` acts on its cause: restores a file, or pushes env. */
  fixable?: boolean
}

/** One group's findings, by id. */
export type FindingEntries = Readonly<Record<string, FindingEntry>>

/** One check's result, as `doctor --json` reports it. */
export interface PreflightFinding {
  id: string
  /** The app capability it is about: the name `doctor --only` selects it by. */
  capability: CapabilityName
  title: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  fixHint: string
  /** The finding's entry in the docs: `https://nuxt-backend.dev/d/<id>`. */
  docsUrl: string
}
