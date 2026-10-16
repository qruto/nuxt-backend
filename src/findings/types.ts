/** The part of the app a finding is about: what `doctor --only` selects. */
export type FindingService = 'deployment' | 'auth' | 'email' | 'billing' | 'agents' | 'ai' | 'scaffold'

/** What the registry knows about one finding id, apart from its service. */
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

/** One service's findings, by id. */
export type FindingEntries = Readonly<Record<string, FindingEntry>>

/** One check's result, as `doctor --json` reports it. */
export interface PreflightFinding {
  id: string
  service: FindingService
  title: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  fixHint: string
  /** The finding's entry in the docs: `https://nuxt-backend.dev/d/<id>`. */
  docsUrl: string
}
