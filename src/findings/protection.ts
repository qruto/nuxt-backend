import type { FindingEntries } from './types'

/**
 * Bot protection: whether one is live, the proof secret both sides share,
 * and the challenge's two keys.
 */
export const PROTECTION_FINDINGS = {
  'bot-protection': { title: 'Bot protection' },
  'protection-proof': { title: 'Bot-check proof' },
  'protection-challenge-keys': { title: 'Challenge keys' },
  'waitlist-bot-check': { title: 'Waitlist bot check' },
  'contact-bot-check': { title: 'Contact form bot check' },
  // Guest jobs: a visitor's cookie and proof are signed with PROTECTION_PROOF_SECRET.
  'protection-guest-jobs': { title: 'Guest jobs', prod: 'fail' },
  'deployment-protection-proof-secret': { title: 'Deployment PROTECTION_PROOF_SECRET', fixable: true },
  'deployment-protection-challenge-secret-key': { title: 'Deployment PROTECTION_CHALLENGE_SECRET_KEY', fixable: true },
} as const satisfies FindingEntries
