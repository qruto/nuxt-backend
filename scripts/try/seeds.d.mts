import type { TryPersona } from './personas.mjs'

/** What the deployment answers for a seeded account. */
export interface SeededAccount {
  key: string
  userId: string
  workspaceId: string
  created: boolean
}

/** What seeding runs with. */
export interface SeedContext {
  convexRun: (fn: string, args: Record<string, unknown>) => Promise<unknown>
  /** The sandbox catalog ids (`billing.generated.ts`); absent while billing is missing. */
  catalog?: { products?: Record<string, string>, gifts?: Record<string, string>, plans?: Record<string, { month?: string, year?: string }>, free?: string } | undefined
  /** The deployment holds an AI gateway key: the canned-idea cache is drawn. */
  ai?: boolean
  /** The fixture panels a ready strip is drawn with, base64 PNG images, read from `fixtures/` when absent. */
  panels?: string[]
  log: (line: string) => void
}

/** One step of the seed registry. */
export interface SeedStep {
  name: string
  /** The persona fields it reads. */
  fields: readonly string[]
  applies: (persona: TryPersona) => boolean
  run: (personas: TryPersona[], context: SeedContext, accounts: Map<string, SeededAccount>) => Promise<void>
}

export declare const SEEDS: readonly SeedStep[]
/** The fixture panels, base64 PNG images read from `fixtures/`. */
export declare function fixturePanels(): string[]
export declare function seedOrder(personas: readonly TryPersona[]): TryPersona[]
/** The purchase that gives a persona its billing state, in words. */
export declare function purchaseOf(persona: TryPersona): string
export declare function seedPersonas(context: SeedContext, personas?: readonly TryPersona[]): Promise<Map<string, SeededAccount>>
