/** Every Markdown file a set of Nuxt Content sources serves, with its route and its stem (the sidebar's order). */
export declare function docsFiles(
  content: string,
  sources: ReadonlyArray<{ include: string, exclude?: string[], prefix: string }>,
): Array<{ file: string, stem: string, route: string }>
