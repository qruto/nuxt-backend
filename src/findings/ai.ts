import type { FindingEntries } from './types'

/** Metered AI: the stream route, once setupAi is deployed. */
export const AI_FINDINGS = {
  'ai-stream-route': { title: 'AI stream route' },
} as const satisfies FindingEntries
