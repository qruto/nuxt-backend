/**
 * The release line these docs describe. Docus's openapi.json and llms.txt
 * read it, and the docs chrome shows it with an amber "unreleased" light
 * until `released` flips. It flips in the release pull request, the one that
 * moves package.json to this line, so the merged docs and the tag agree.
 */
export const DOCS_VERSION = { line: '0.2.x', released: true } as const
