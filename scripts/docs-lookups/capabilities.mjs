/**
 * Reference › Capabilities: every capability of the registry (src/capabilities/), with
 * what it gives the app, what it is built on, how it runs in development, and
 * the env names, findings, docs home, DevTools tab and playground pages it
 * owns. The page keeps its own frontmatter and opening, which
 * say what the release changes; the region below them is generated: edit the
 * registry.
 */
import { PANEL_TABS } from '../../devtools-client-app/app/nav.ts'
import { FINDINGS } from '../../src/findings/index.ts'
import { CAPABILITY_NAMES, CAPABILITY_STATE_MEANING, CAPABILITY_STATES, CAPABILITIES } from '../../src/capabilities/index.ts'
import { blocks, code, link, list, table } from './markdown.mjs'
import { diagnosticsLink, PAGES } from './paths.mjs'

/** The page's route, which the concept page and the CLI page link to. */
export const CAPABILITIES_PAGE = '/docs/reference/capabilities'

/** The label of the DevTools tab a panel id names. */
const tabLabel = id => PANEL_TABS.find(tab => tab.id === id).label

/** A capability's own section: what it owns, each name linked to its entry. */
function capabilitySection(name) {
  const capability = CAPABILITIES[name]
  const findings = Object.keys(FINDINGS).filter(id => FINDINGS[id].capability === name)
  return blocks(
    `## \`${name}\``,
    capability.purpose,
    list([
      `**Built on:** ${capability.providers.map(provider => `${provider.name}, for ${provider.gives}`).join('; ')}.`,
      `**In development:** ${capability.development}.`,
      `**Env:** ${capability.env.length ? capability.env.map(env => link(code(env), `${PAGES.envVars}#every-variable`)).join(', ') : 'none of its own'}.`,
      `**Findings:** ${findings.length ? `${findings.map(diagnosticsLink).join(', ')}; \`doctor --only ${name}\` runs them` : 'none of its own'}.`,
      `**Docs:** ${link(capability.title, capability.docs)}.`,
      `**DevTools:** the ${tabLabel(capability.devtools)} tab.`,
      `**Playground:** ${capability.playground.map(page => link(code(page), page)).join(', ')}.`,
    ]),
  )
}

/** The page's generated region: the table, the states and each capability's section. */
export function capabilitiesPage() {
  return blocks(
    table(['Capability', 'Gives the app', 'Built on', 'In development'], CAPABILITY_NAMES.map(name => [
      link(code(name), `#${name}`),
      CAPABILITIES[name].purpose,
      CAPABILITIES[name].providers.map(provider => provider.name).join(', '),
      CAPABILITIES[name].development,
    ])),
    '## States',
    table(['State', 'Light', 'Means'], CAPABILITY_STATES.map(state => [code(state), CAPABILITY_STATE_MEANING[state].light, CAPABILITY_STATE_MEANING[state].means])),
    CAPABILITY_NAMES.map(capabilitySection),
  )
}
