/** The names of every region a file's text marks. */
export declare function regionNames(file: string, text: string): string[]

/** What sits between a region's markers, or `undefined` when the file has no such region. */
export declare function readRegion(file: string, text: string, name: string): string | undefined

/** The text with one region's body replaced; throws when the file does not mark the region once. */
export declare function writeRegion(file: string, text: string, name: string, body: string, source: string): string
