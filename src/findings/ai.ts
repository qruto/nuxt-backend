import type { FindingEntries } from './types'

/**
 * Metered AI: the stream route, once setupAi is deployed, the key the
 * models the backend names need, and the key content credentials are
 * signed with once the backend turns provenance on.
 */
export const AI_FINDINGS = {
  'ai-stream-route': { title: 'AI stream route' },
  // `ai.chat` and `ai.knowledge` run on Convex's Agent and RAG components, which the app mounts itself.
  'ai-components': { title: 'Chat and knowledge components', prod: 'fail' },
  // A sandbox (a public demo) makes no model call without a daily spend limit.
  'ai-spend-limit': { title: 'AI spend limit on a sandbox', prod: 'fail' },
  'deployment-ai-gateway-api-key': { title: 'Deployment AI_GATEWAY_API_KEY', prod: 'fail', fixable: true },
  'deployment-provenance-private-key': { title: 'Deployment PROVENANCE_PRIVATE_KEY', prod: 'fail', fixable: true },
  'deployment-provenance-certificate': { title: 'Deployment PROVENANCE_CERTIFICATE', prod: 'fail', fixable: true },
} as const satisfies FindingEntries
