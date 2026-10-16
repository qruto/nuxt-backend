/** Names that keep their capitals wherever they stand. */
export declare const PROPER_NOUNS: string[]

/** Sentence case for one line of title text. */
export declare function sentenceCase(text: string): string

/** The file's text in house style. */
export declare function styled(file: string, text: string): string

/** Every hand-written docs file the style applies to, repo-relative. */
export declare function styledFiles(): string[]
