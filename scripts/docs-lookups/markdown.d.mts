/** A code span, wide enough for the backticks inside it. */
export declare function code(text: unknown): string

/** Code spans joined with commas, or `empty` when there are none. */
export declare function codes(values: readonly unknown[], empty?: string): string

/** A Markdown table: a header row, its rule, then one row per entry. */
export declare function table(headers: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string

/** A bulleted list, one item per line. */
export declare function list(items: readonly string[]): string

/** Paragraphs and blocks, separated by blank lines; empty ones dropped. */
export declare function blocks(...parts: unknown[]): string

/** A docs link. */
export declare function link(text: string, to: string): string
