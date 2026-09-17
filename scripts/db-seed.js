#!/usr/bin/env node
/**
 * Seeds the website (dev app) Convex database with playground demo data.
 *
 * Reads CONVEX_DEPLOYMENT and CONVEX_URL from the repo-root .env.local, then
 * runs `seed:seedAll` — every existing user gets the demo rows (counter,
 * todos, messages, logs) plus a "Demo team" workspace with a pending
 * invitation. Idempotent per user, so re-running never duplicates anything.
 * New sign-ups self-seed via the `onUserCreated` hook; this script refills
 * accounts that predate it (or a fresh sign-in after `db:reset`).
 *
 * Usage:
 *   node scripts/db-seed.js
 *   pnpm run db:seed
 */

import { convexRun } from './lib/dev-deployment.mjs'

console.log('Seeding playground demo data...\n')

try {
  console.log('✓ seed:seedAll:', convexRun(['seed:seedAll', '{}']))
}
catch (err) {
  console.error('✗ seed:seedAll:', err.stderr?.toString() || err.message)
  process.exit(1)
}

console.log('\nSeed complete.')
