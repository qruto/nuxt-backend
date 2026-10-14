import { DEFAULT_AGENT_CONSENT_PATH } from '../convex/constants'
import { definePage } from './define'

/** Where a person approves or denies an agent's request for access (private). Default `/oauth/consent`; keep it equal to the Convex-side `mcp.consentPath`. */
export default definePage({ key: 'agentConsent', defaultPath: DEFAULT_AGENT_CONSENT_PATH, file: 'agent-consent', auth: true })
