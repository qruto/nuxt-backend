import type { FindingEntries } from './types'

/**
 * Metered AI: the stream route, once setupAi is deployed, the key the
 * models the backend names need, and the key content credentials are
 * signed with once the backend turns provenance on; under `--prod`, what
 * caps production's model spend.
 */
export const AI_FINDINGS = {
  'ai-stream-route': { title: 'AI stream route' },
  // `ai.chat` and `ai.knowledge` run on Convex's Agent and RAG components, which the app mounts itself.
  'ai-components': { title: 'Chat and knowledge components', prod: 'fail' },
  // A sandbox (a public demo) makes no model call without a daily spend limit.
  'ai-spend-limit': { title: 'AI spend limit on a sandbox', prod: 'fail' },
  // --prod only, off a sandbox: setupAi's daily spendLimit, and the cap of each gateway the order sends calls through, which doctor does not read.
  'ai-gateway-budget': { title: 'AI gateway budget' },
  // The default classifier through the Vercel AI Gateway reads text only: a check with images is refused.
  'ai-moderation-images': { title: 'Image checks and the safety classifier' },
  'deployment-ai-gateway-api-key': { title: 'Deployment AI_GATEWAY_API_KEY', prod: 'fail', fixable: true },
  'deployment-provenance-private-key': { title: 'Deployment PROVENANCE_PRIVATE_KEY', prod: 'fail', fixable: true },
  'deployment-provenance-certificate': { title: 'Deployment PROVENANCE_CERTIFICATE', prod: 'fail', fixable: true },
} as const satisfies FindingEntries
