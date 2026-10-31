import type { AgentSkill } from '../src/guidance/skills'

/** One export of an import path, followed to its declaration. */
export interface ExportedName {
  name: string
  type: boolean
  fn: boolean
  doc: string
  /** The repo-relative source file it is declared in, or the package it re-exports. */
  origin: string
}

/** What the generator reads from the code, once. */
export interface GuidanceData {
  entries: Array<{ path: string, source: string, typesOnly: boolean, exports: ExportedName[] }>
  composables: Array<{ name: string, file: string, doc: string }>
  components: Array<{ name: string, exported: string, file: string, doc: string }>
  aliases: string[]
  appAliases: string[]
  server: string[]
  middleware: string[]
  base: { composables: string[], components: string[], types: string[] }
  pages: Array<{ key: string, path: string, doc: string }>
  cli: Array<{ path: string, description: string, flags: Array<{ flag: string, description: string }> }>
  errors: Array<{ code: string, status: number }>
  findings: Array<{ id: string, capability: string, group: string, title: string }>
  capabilities: Array<{ name: string, title: string, env: string[] }>
  env: Array<{ name: string }>
  functions: Readonly<Record<string, readonly string[]>>
  docs: Array<{ file: string, route: string, title?: string, description?: string, kind?: string, source?: string }>
}

/** The public-surface manifest, as references/surface.json holds it. */
export interface SurfaceManifest {
  entrypoints: Record<string, { values: string[], types: string[] }>
  autoImports: {
    composables: string[]
    components: string[]
    server: string[]
    middleware: string[]
    baseModule: { composables: string[], components: string[], types: string[] }
  }
  aliases: string[]
  pages: Record<string, string>
  cli: Record<string, string[]>
  errors: string[]
  findings: Record<string, string>
  capabilities: Record<string, string[]>
  env: Record<string, string>
  functions: Record<string, string[]>
}

export declare function collect(): GuidanceData
export declare function surfaceManifest(data: GuidanceData): SurfaceManifest & { $comment: string }
export declare function headingAnchor(heading: string): string
export declare function bareName(text: string): string
export declare function knownNames(data: GuidanceData): Set<string>
export declare function renamedNames(data: GuidanceData): Array<{ wrong: string, right: string, note?: string }>
export declare function fillRegions(text: string, blocks: Record<string, string>, file?: string): string
/** The skill a docs route belongs to: the one whose `docs` holds the longest prefix of it. */
export declare function skillOf(route: string): AgentSkill | undefined
/** The skill a doctor finding belongs to: the one that names its id, else the one that names its group. */
export declare function findingSkill(item: { id: string, group: string }): AgentSkill | undefined
/** The generated regions a skill's SKILL.md holds. */
export declare function skillRegions(name: string): string[]
/** Every generated file, by repo-relative path, with its content. */
export declare function outputs(data?: GuidanceData): Record<string, string>
/** The generated files under skills/ that `outputs` no longer writes. */
export declare function orphans(files?: Record<string, string>): string[]
