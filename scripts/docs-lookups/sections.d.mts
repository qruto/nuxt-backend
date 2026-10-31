/** A heading's anchor, as the docs site makes it. */
export declare function anchorOf(heading: string): string

/** Every search section of a page with whether it is generated. */
export declare function sectionsOf(route: string, text: string): Array<{ id: string, generated: boolean }>
