/** A docs page rendered from a repository file. */
export interface DocsInclude {
  source: string
  page: string
  title: string
  description: string
  icon: string
}

export declare const INCLUDES: DocsInclude[]

/** The page content `include.source` renders to. */
export declare function render(include: DocsInclude): string
