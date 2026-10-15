import type { FindingEntries } from './types'

/** The agent (MCP) endpoint and the pages an agent's authorization sends people to. */
export const AGENTS_FINDINGS = {
  'mcp': { title: 'Agent endpoint' },
  'agent-login-path': { title: 'Agent sign-in route' },
  'agent-consent-path': { title: 'Agent consent route' },
} as const satisfies FindingEntries
