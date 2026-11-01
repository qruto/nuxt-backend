/**
 * The release line these docs describe. Docus's openapi.json and llms.txt
 * read it, and the docs chrome shows it with an amber "unreleased" light
 * until `released` flips, in the pull request that follows the publish.
 */
export const DOCS_VERSION = { line: '0.2.x', released: false } as const
