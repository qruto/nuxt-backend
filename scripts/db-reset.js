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

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const [key, ...rest] = trimmed.split('=')
  if (!key) return null
  return [key.trim(), rest.join('=').split('#')[0].trim()]
}

// Load .env.local without external deps
function loadEnvFile(path) {
  try {
    const env = {}
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const pair = parseEnvLine(line)
      if (pair) env[pair[0]] = pair[1]
    }
    return env
  }
  catch {
    return {}
  }
}

const env = loadEnvFile(resolve(root, '.env.local'))
const deployment = env.CONVEX_DEPLOYMENT
const url = env.CONVEX_URL

if (!deployment) {
  console.error('CONVEX_DEPLOYMENT not found in .env.local. Run `npx convex dev` first.')
  process.exit(1)
}

const baseEnv = { ...process.env, CONVEX_DEPLOYMENT: deployment }
const urlArgs = url ? `--url ${url}` : ''

function run(label, args) {
  try {
    const result = execSync(
      `pnpm exec convex run ${args} ${urlArgs}`,
      { env: baseEnv, cwd: root, stdio: 'pipe' },
    ).toString().trim()
    console.log(`✓ ${label}:`, result)
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
run('todos', '_clearAll:run \'{}\'')

// Clear the backend component's auth tables
for (const model of componentModels) {
  const args = JSON.stringify({ input: { model }, paginationOpts: JSON.parse(paginationOpts) })
  run(`component/${model}`, `--component backend adapter:deleteMany '${args}'`)
}

// Clear the billing entitlement cache (derived data — resyncs from the provider)
run('billing/entitlements', '--component backend billing:clear \'{}\'')

console.log('\nDatabase reset complete.')
