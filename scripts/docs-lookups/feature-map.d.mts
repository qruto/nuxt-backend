/** The page the Feature map is written into. */
export declare const FEATURE_MAP_FILE: string

/** What each `status` reads as on the map: the legend's words. */
export declare const STATUS_LABELS: {
  readonly stable: 'Available'
  readonly experimental: 'Experimental'
  readonly deprecated: 'Deprecated'
  readonly changing: 'Changing'
  readonly planned: 'Planned'
}

/** Every hand-written docs page, with the frontmatter the map reads, in the sidebar's order. */
export declare function mapPages(): Array<{ file: string, route: string, meta: Record<string, string> }>

/** A page's status cell: the legend's word, and the unit a marker names. */
export declare function statusCell(meta: Record<string, string | undefined>): string

/** A description as a table cell renders it: each word holding an angle bracket as a code span. */
export declare function cellText(description: string): string

/** The map's sections: each layer's heading, its sentence and a row per page that names it. */
export declare function featureMap(): string
