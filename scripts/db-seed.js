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

console.log('Seeding playground demo data...\n')

try {
  const result = execSync(
    `pnpm exec convex run seed:seedAll '{}' ${urlArgs}`,
    { env: baseEnv, cwd: root, stdio: 'pipe' },
  ).toString().trim()
  console.log('✓ seed:seedAll:', result)
}
catch (err) {
  console.error('✗ seed:seedAll:', err.stderr?.toString() || err.message)
  process.exit(1)
}

console.log('\nSeed complete.')
