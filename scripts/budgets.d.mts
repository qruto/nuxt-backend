export interface Measurement {
  bytes: number
  /** Left out where only bytes count (the starter's entry). */
  files?: number
}

export interface Budget {
  measured: Measurement
  ceiling: Measurement
}

/** budgets.json, parsed. */
export declare function readBudgets(): Record<string, Budget>

/** Bytes and files under a directory, every regular file counted. */
export declare function measure(dir: string): Measurement

/** The ceiling for a measurement: bytes rounded up to three significant figures, files, when it counts them, up to a whole file. */
export declare function ceilingFor(measured: Measurement): Measurement

/** One message per limit a measurement goes over; empty when it fits the ceiling. */
export declare function overBudget(measured: Measurement, ceiling: Measurement): string[]

/** Bytes and files of an installed `node_modules`, the installer's own bookkeeping (`.package-lock.json`, `.bin`) left out. */
export declare function measureInstalled(nodeModules: string): Measurement

/** The JavaScript a built Nuxt app's every page loads before it runs, gzipped. */
export declare function measureClientEntry(app: string): Promise<Measurement>
