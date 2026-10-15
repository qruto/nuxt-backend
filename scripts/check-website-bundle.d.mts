/** Code a page must not load before it is asked for, by a string its chunk always carries. */
export declare const DEFERRED: ReadonlyArray<{ what: string, marker: string }>

/** The most initial JavaScript, gzipped, any page may ship. */
export declare const CEILING: number

/** The chunks a script imports statically: `import "./x.js"` and `from "./x.js"`, never `import("./x.js")`. */
export declare function staticImports(code: string): string[]

/** The module scripts a page names: its entry and its modulepreload links, never a prefetch. */
export declare function pageScripts(html: string): string[]
