#!/usr/bin/env node
/**
 * Resets the playground Convex database for testing.
 *
 * Reads CONVEX_DEPLOYMENT and CONVEX_URL from playground/../.env.local,
 * then clears all tables in both the main schema and the auth component.
 *
 * Usage:
 *   node scripts/db-reset.mjs
 *   npm run db:reset
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Load .env.local without external deps
function loadEnvFile(path) {
  try {
    const content = readFileSync(path, 'utf8')
    const env = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [key, ...rest] = trimmed.split('=')
      if (key) env[key.trim()] = rest.join('=').split('#')[0].trim()
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
      `npx convex run ${args} ${urlArgs}`,
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

// Auth component models (from src/convex/component/schema.ts + plugins)
const componentModels = ['session', 'account', 'verification', 'passkey', 'jwks', 'rateLimit', 'user']

console.log('Resetting Convex database...\n')

// Clear main schema tables
run('todos', '_clearAll:run \'{}\'')

// Clear auth component tables (sessions/accounts before users to avoid FK issues)
for (const model of componentModels) {
  const args = JSON.stringify({ input: { model }, paginationOpts: JSON.parse(paginationOpts) })
  run(`component/${model}`, `--component backend adapter:deleteMany '${args}'`)
}

console.log('\nDatabase reset complete.')
