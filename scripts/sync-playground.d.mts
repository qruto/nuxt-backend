/** The website, where the playground is edited. */
export declare const SOURCE: string
/** examples/playground, the standalone copy. */
export declare const TARGET: string
/** Example files written by hand, which the sync never writes nor removes. */
export declare const OWNED: readonly string[]
/** Every website file the playground reaches, website-relative and sorted. */
export declare function collect(): string[]
/** Every synced path → the content it must have in the example. */
export declare function expected(): Map<string, string>
/** How the example differs from the website: missing, changed and stale files. */
export declare function drift(): { missing: string[], changed: string[], stale: string[] }
