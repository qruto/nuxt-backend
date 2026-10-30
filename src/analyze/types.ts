// The shape of an `analyze` report: what `analyze --json` prints, what the
// DevTools Bundles panel shows, and what `doctor` reads back from the last
// run. Type-only: the panel imports it.

/** The bundles `analyze` measures: the backend's Convex bundle, and the Nuxt app's browser and server bundles. */
export type BundleId = 'convex' | 'client' | 'server'

/** The halves `--only` selects. */
export type AnalyzeHalf = 'convex' | 'nuxt'

/** One package in a bundle, by the code it adds. */
export interface BundlePackage {
  name: string
  /** Known for the Convex bundle, which reads it off the install; the Nuxt bundles do not know it. */
  version?: string
  /** Code bytes, without source maps. */
  bytes: number
}

/** A part of the Convex bundle: the app's functions, or one component. */
export interface BundlePart {
  name: string
  bytes: number
}

/** Who a share of a bundle belongs to. */
export type ShareId = 'nuxt-backend' | 'app' | 'other'

/** How much of a bundle one party brings. */
export interface BundleShare {
  id: ShareId
  label: string
  bytes: number
  /** `bytes` over the bundle's, from 0 to 1. */
  share: number
}

/** Something that would make a bundle smaller. */
export interface BundleInsight {
  /** The finding's kind: the Convex analyzer's own (`duplicate-package`, `package-in-many-components`, …) or this command's (`large-package`). */
  kind: string
  level: 'info' | 'warn'
  title: string
  detail?: string
  /** What fixing it would take out of the code, in bytes. */
  savedBytes: number
  /** The package or file it is about. */
  subject?: string
}

/** One measured bundle. */
export interface BundleReport {
  id: BundleId
  title: string
  /** The code's size, without source maps: what a budget is held to. */
  bytes: number
  /** The browser bundle's size once gzipped. */
  gzipBytes?: number
  /** Convex only: the size of the source maps, which `bytes` leaves out. */
  sourceMapBytes?: number
  /** Convex only: the app's functions and each component, largest first. */
  parts: BundlePart[]
  /** The largest packages, and the app's own code under the name `your code`. */
  packages: BundlePackage[]
  shares: BundleShare[]
  insights: BundleInsight[]
  /** What the measurement could not be exact about. */
  notes: string[]
}

/** A bundle held to a budget. */
export interface BudgetCheck {
  bundle: BundleId
  /** The flag that set it: `--max-convex`, `--max-client` or `--max-server`. */
  flag: string
  limit: number
  bytes: number
  over: boolean
  /** When over, the packages that grew most since the run before (by how much); none without a run to compare with. */
  grew: BundlePackage[]
}

/** A half that could not be measured. */
export interface AnalyzeFailure {
  half: AnalyzeHalf
  message: string
}

/** What `analyze --json` prints. */
export interface AnalyzeReport {
  version: 1
  /** When the run finished (ISO 8601). */
  ranAt: string
  bundles: BundleReport[]
  budgets: BudgetCheck[]
  failures: AnalyzeFailure[]
}
