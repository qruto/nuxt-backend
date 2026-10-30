import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { AxeResults } from 'axe-core'
import type { Page } from 'playwright-core'

/** axe-core's browser build, read once: injected into each page it checks. */
const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

/**
 * The rules the smoke runs: every non-experimental WCAG 2.0, 2.1 and 2.2
 * rule at levels A and AA that axe-core has (an experimental rule is off
 * unless enabled by name). axe's best-practice rules (a `<main>` per page,
 * every element in a landmark) stay out: they judge the app's layout, not
 * the packaged markup inside it.
 */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/**
 * Rules whose undecided results fail the smoke too: axe marks a contrast it
 * could not compute (text over an image or a gradient) incomplete, and an
 * unchecked contrast is not a passed one.
 */
const DECIDE = new Set(['color-contrast'])

/**
 * Run axe-core on the page as it stands and return each violation, and each
 * contrast axe could not decide, as one readable line per element: the
 * rule, its impact, the element and what to fix. The source is evaluated through the debugging protocol rather than
 * added as a `<script>`, so the app's Content-Security-Policy, which allows
 * no inline script, does not stop it.
 */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(AXE_SOURCE)
  const results = await page.evaluate(
    tags => (window as unknown as { axe: { run: (context: Document, options: object) => Promise<AxeResults> } }).axe.run(document, { runOnly: { type: 'tag', values: tags } }),
    WCAG_TAGS,
  )
  const undecided = results.incomplete.filter(result => DECIDE.has(result.id)).map(result => ({ ...result, id: `${result.id}, undecided` }))
  return [...results.violations, ...undecided].flatMap(result => result.nodes.map(node =>
    `${result.id} (${result.impact ?? 'unknown'}): ${node.target.join(' ')}: ${node.failureSummary?.replace(/\s+/g, ' ') ?? result.help}`))
}
