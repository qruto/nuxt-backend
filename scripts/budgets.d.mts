export interface Measurement {
  bytes: number
  files: number
}

export interface Budget {
  measured: Measurement
  ceiling: Measurement
}

/** budgets.json, parsed. */
export declare function readBudgets(): Record<string, Budget>

/** Bytes and files under a directory, every regular file counted. */
export declare function measure(dir: string): Measurement

/** The ceiling for a measurement: bytes rounded up to 10 kB, files up to a whole file. */
export declare function ceilingFor(measured: Measurement): Measurement

/** One message per limit a measurement goes over; empty when it fits the ceiling. */
export declare function overBudget(measured: Measurement, ceiling: Measurement): string[]
