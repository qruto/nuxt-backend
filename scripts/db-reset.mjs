#!/usr/bin/env node
/**
 * Resets the website (dev app) Convex database for testing.
 *
 * Reads CONVEX_DEPLOYMENT and CONVEX_URL from the repo-root .env.local,
 * then clears all tables in both the main schema and the backend component.
 *
 * Usage:
 *   node scripts/db-reset.mjs
 *   pnpm run db:reset
 */

import { convexRun } from './lib/dev-deployment.mjs'

function run(label, args) {
  try {
    console.log(`✓ ${label}:`, convexRun(args))
  }
  catch (err) {
    console.error(`✗ ${label}:`, err.stderr?.toString() || err.message)
    process.exit(1)
  }
}

const paginationOpts = JSON.stringify({ cursor: null, numItems: 1000 })

// Auth models (from src/convex/components/backend/schema.ts + plugins).
// Dependent rows (sessions/memberships) before their owners to avoid FK issues.
const componentModels = [
  'session', 'account', 'verification', 'passkey', 'jwks', 'rateLimit',
  'member', 'invitation', 'organization', 'user',
]

console.log('Resetting Convex database...\n')

// Clear main schema tables
run('todos', ['_clearAll:run', '{}'])

// Clear the backend component's auth tables
for (const model of componentModels) {
  const args = JSON.stringify({ input: { model }, paginationOpts: JSON.parse(paginationOpts) })
  run(`component/${model}`, ['--component', 'backend', 'adapter:deleteMany', args])
}

// Clear the billing entitlement cache (derived data — resyncs from the provider)
run('billing/entitlements', ['--component', 'backend', 'billing:clear', '{}'])

console.log('\nDatabase reset complete.')
