import type ts from 'typescript'

/** One export of a module: its name, whether it is a type, its doc comment, and where it is declared. */
export interface SurfaceExport {
  name: string
  type: boolean
  doc: string
  origin: string
}

/** One import path of the package. */
export interface Entrypoint {
  subpath: string
  path: string
  source: string
  built: string
  typesOnly: boolean
}

/** What the module registers by name. */
export interface ModuleRegistry {
  composables: Array<{ name: string, file: string }>
  components: Array<{ name: string, exported: string, file: string }>
  /** The parts of the packaged components, each registered under its own name. */
  parts: Array<{ name: string, parent: string, file: string }>
  aliases: Array<{ name: string, exported: string }>
  server: string[]
  middleware: string[]
  /** The route middleware registered `global: true`: it runs on every navigation, and a page never names it. */
  globalMiddleware: string[]
  appAliases: string[]
}

export declare const root: string
export declare function readText(file: string): string
export declare function sourceOf(file: string): ts.SourceFile
export declare function declarationOf(file: string, name: string): { file: string, statement: ts.Statement } | undefined
export declare function docText(node: ts.Node): string
export declare function tagText(node: ts.Node, tag: string): string | undefined
export declare function docOf(file: string, name: string): string
export declare function firstSentence(text: string): string
export declare function exportsOf(file: string): SurfaceExport[]
export declare function valueExports(file: string): string[]
export declare function entrypoints(): Entrypoint[]
export declare function typeMembers(file: string, name: string): string[] | undefined
export declare function appAliases(): string[]
export declare function moduleRegistry(): ModuleRegistry
export declare function baseModuleSurface(): { composables: string[], types: string[], components: string[], server: string[] }
export { ts }
export declare function textExports(text: string): string[]
