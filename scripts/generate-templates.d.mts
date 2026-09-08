export declare const COMPONENT_DIR: string
export declare const COMPONENT_MODULES: readonly string[]
export declare const OUTPUT_FILE: string
/** Sorted, unique names of a TypeScript module's top-level value exports. */
export declare function exportedNames(filename: string, sourceText: string): string[]
/** The full text of `src/templates.generated.ts` for the component sources under `dir` (defaults to the repo). */
export declare function generate(dir?: string): string
