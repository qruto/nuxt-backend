// THE RELEASE MARKERS. The docs describe the whole release they belong to,
// before all of it is built, so a page says when the code is not there yet.
// Two frontmatter pairs do it, each naming the unit of the release plan that
// closes the gap:
//
// - `status: planned` + `plannedBy: <UNIT>`: the feature is not built yet.
// - `status: changing` + `changedBy: <UNIT>`: the feature is built, but the
//   page shows its API as the release reshapes it (renamed, simplified,
//   moved), and the code still has the previous one.
//
// Everything else follows from those fields:
//
// - components/docs/DocsPageChips.vue shows the Planned chip (an unlit
//   light) or the Changing chip (an amber square) beside the kind;
// - modules/docs-pages.ts opens the stored page with its callout (the page
//   shows it, the site's search indexes it, the Markdown twin prints it) and
//   badges the page's navigation entry;
// - shared/agent-surfaces.ts opens the page's llms.txt description with
//   `markedDescription`, and the twin's header says `Status: planned` or
//   `Status: changing`;
// - the page contract's code pins skip the page, since the names it uses do
//   not exist yet; test/docs/planned-pages.test.ts holds every marked page to
//   a unit of the plan, and the Feature map (generated from each page's
//   `layer`, `status` and unit by `pnpm docs:lookups`) lists it.
//
// When the unit lands, it makes the code match the page, drops both fields,
// and the page joins the pins. CONTRIBUTING.md says the same for
// contributors.
//
// No imports: the Nitro plugin and scripts/check-website-agents.mjs load it.

/** The `status` of a page that describes what is not built yet. */
export const PLANNED = 'planned'

/** The `status` of a page that describes a built feature's API as the release changes it. */
export const CHANGING = 'changing'

/** The release a planned feature arrives in: the first of the line these docs describe (test/docs/planned-pages.test.ts). */
export const PLANNED_RELEASE = '0.2.0'

/** The page that lists every feature with its status, and its legend. */
export const FEATURE_MAP = '/docs/start/feature-map'
export const FEATURE_MAP_STATUSES = `${FEATURE_MAP}#statuses`

/** What a planned page's callout says, after its bold "Planned." and before the link to the Feature map. */
export const PLANNED_NOTE = `Arrives in ${PLANNED_RELEASE}: described here so you can see the whole package, and not in the playground yet.`

/** What a changing page's callout says, after its bold "Changing." and before the link to the Feature map. */
export const changingNote = (unit: string): string => `Describes the ${PLANNED_RELEASE} API. The code still has the previous one until ${unit} lands.`

/** Whether a page (its frontmatter, or the parsed page) is planned. */
export const isPlanned = (page: { status?: unknown }): boolean => page.status === PLANNED

/** Whether a page (its frontmatter, or the parsed page) shows an API the release changes. */
export const isChanging = (page: { status?: unknown }): boolean => page.status === CHANGING

/** Whether a page is ahead of the code, planned or changing: the code pins skip it. */
export const isAheadOfCode = (page: { status?: unknown }): boolean => isPlanned(page) || isChanging(page)

/** A planned page's description as llms.txt lists it: the status first, then the page's own words. */
export const plannedDescription = (description: string): string => `Planned for ${PLANNED_RELEASE}, not built yet. ${description}`

/** A changing page's description as llms.txt lists it: what the code still has first, then the page's own words. */
export const changingDescription = (description: string, unit?: string): string =>
  `Changing in ${PLANNED_RELEASE}: describes the new API, and the code keeps the previous one until ${unit ?? 'its unit'} lands. ${description}`

/** A page's description as llms.txt lists it, opened with its marker when it has one. */
export function markedDescription(page: { status?: unknown, changedBy?: unknown }, description: string): string {
  if (isPlanned(page)) return plannedDescription(description)
  if (isChanging(page)) return changingDescription(description, typeof page.changedBy === 'string' ? page.changedBy : undefined)
  return description
}
