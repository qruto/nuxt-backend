#!/usr/bin/env node
/**
 * `pnpm try:starter` — the package as an app installs it: packed
 * (`pnpm pack`), installed into a fresh copy of `templates/starter` in this
 * user's cache (STARTER_DIR), and run on a local deployment of its own with
 * the providers' sandboxes at https://starter.localhost — what a new user gets
 * from `create nuxt` and the quickstart, before anything is published.
 *
 *   pnpm try:starter             pack, copy, install, run
 *   pnpm try:starter --no-pack   use the nuxt-backend-*.tgz already beside package.json
 *
 * The starter runs `nuxt-backend dev`, the command the template's `dev`
 * script is: it provisions an account-less local deployment, pushes its env
 * (`SITE_URL` the starter's origin, the local origins trusted) and pushes the
 * sandbox keys the root `.env.local` holds (a Polar sandbox token, a Resend
 * key), which the copy's `.env.local` is given. Without a key, billing and
 * email read `missing` and sign-in codes print in the terminal. Sign-in takes
 * a test address (`delivered+you@resend.dev`); the one-time catalog sync is
 * `npx nuxt-backend billing sync` in the copy.
 * Ctrl-C stops it; the copy stays until the next run replaces it.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { bin, childEnv, convex, createSession, deploymentRefusal, localPorts, portless, proxyDeployment, readEnvFile, root, scrubDeploymentEnv } from './kit.mjs'
import { rootSandboxKeys } from './sandbox.mjs'

const NAME = 'starter'
/**
 * Where the copy lives: one place, replaced on every run, in this user's
 * cache rather than the shared temp directory, since its .env.local holds the
 * sandbox keys and another account could have made the path first.
 */
export const STARTER_DIR = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'nuxt-backend', 'try-starter')

const log = line => console.log(`\x1B[36m[try:starter]\x1B[0m ${line}`)

/**
 * The release-age cooldown this repository installs with (pnpm-workspace.yaml's
 * `minimumReleaseAge`, in minutes). The copy sits outside the workspace, so
 * its unlocked install gets it explicitly: the local tarball has no publish
 * date, and every other package keeps the cooldown.
 */
const MINIMUM_RELEASE_AGE = '1440'

/** The one tarball beside package.json, packed first unless asked not to. */
function tarball(pack) {
  const packed = () => readdirSync(root).filter(name => /^nuxt-backend-.+\.tgz$/.test(name))
  if (pack) {
    for (const stale of packed()) rmSync(join(root, stale))
    log('Packing the package (pnpm pack builds it first)…')
    execFileSync('pnpm', ['pack'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  }
  const found = packed()
  if (found.length !== 1) throw new Error(`Expected one nuxt-backend-*.tgz beside package.json, found ${found.length}: run without --no-pack.`)
  return join(root, found[0])
}

/** A fresh copy of templates/starter as git tracks it, with the tarball installed. */
function copyStarter(packedTarball) {
  rmSync(STARTER_DIR, { recursive: true, force: true })
  const tracked = execFileSync('git', ['ls-files', '-z', 'templates/starter'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  for (const file of tracked) {
    const target = join(STARTER_DIR, file.slice('templates/starter/'.length))
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(root, file), target)
  }
  log(`Installing the starter with the packed package in ${STARTER_DIR}…`)
  execFileSync('pnpm', ['add', packedTarball], { cwd: STARTER_DIR, stdio: 'inherit', env: childEnv({ pnpm_config_minimum_release_age: MINIMUM_RELEASE_AGE }) })
}

async function main() {
  const pack = !process.argv.includes('--no-pack')
  scrubDeploymentEnv()
  const packedTarball = tarball(pack)
  copyStarter(packedTarball)

  const session = createSession()
  const got = portless(['get', '--no-worktree', NAME])
  const proxied = process.env.PORTLESS !== '0'
  const app = proxied ? got.stdout.split('\n').pop() : `http://localhost:${process.env.PORT || 3000}`
  if (proxied && !app?.startsWith('http')) throw new Error(`portless could not name the starter: ${got.stderr || got.stdout}`)
  const keys = await rootSandboxKeys()
  writeFileSync(join(STARTER_DIR, '.env.local'), `SITE_URL=${app}\n${Object.entries(keys).map(([name, value]) => `${name}=${value}\n`).join('')}`)

  log('Provisioning the starter\'s own local deployment (no account needed)…')
  // Its first push fails on the env `nuxt-backend dev` provisions next; the deployment exists by then.
  await convex(['dev', '--once', '--typecheck', 'disable'], { cwd: STARTER_DIR, env: childEnv({ CONVEX_AGENT_MODE: 'anonymous' }), timeout: 600_000 }).catch(() => {})
  const env = readEnvFile(join(STARTER_DIR, '.env.local'))
  // Whatever the CLI chose (a signed-in account can get a cloud one), the kit acts on a local deployment only.
  const refusal = deploymentRefusal(env, `${STARTER_DIR}/.env.local`)
  if (refusal) throw new Error(refusal)
  const ports = localPorts(env)
  if (!ports) throw new Error('The starter has no local deployment: run `CONVEX_AGENT_MODE=anonymous npx convex dev --once` in the copy to see why.')

  const urls = { NUXT_PUBLIC_BACKEND_URL: env.CONVEX_URL, NUXT_PUBLIC_CONVEX_SITE_URL: env.CONVEX_SITE_URL }
  if (proxied) {
    const proxiedUrls = proxyDeployment(app, NAME, ports, childEnv(), session.cleanup)
    urls.NUXT_PUBLIC_BACKEND_URL = proxiedUrls.api
    urls.NUXT_PUBLIC_CONVEX_SITE_URL = proxiedUrls.site
  }
  const dev = join(STARTER_DIR, 'node_modules/.bin/nuxt-backend')
  const command = proxied ? [bin('portless'), NAME, dev, 'dev'] : [dev, 'dev']
  session.start(command[0], command.slice(1), { cwd: STARTER_DIR, env: childEnv(urls) })
  log(`The starter runs at ${app} on its own local deployment. Sign in with a test address (delivered+you@resend.dev): its code prints in this terminal${keys.EMAIL_API_KEY ? ' and arrives through Resend (read it with `npx nuxt-backend inbox` in the copy)' : ''}.`)
  log(keys.BILLING_ACCESS_TOKEN ? `Once it is up, create the catalog in Polar's sandbox: cd ${STARTER_DIR} && npx nuxt-backend billing sync` : `Billing reads missing: add a Polar sandbox token (BILLING_ACCESS_TOKEN) to the root .env.local, or to ${join(STARTER_DIR, '.env.local')}.`)
}

main().catch((error) => {
  console.error(`\x1B[31m[try:starter]\x1B[0m ${error.message}`)
  process.exit(1)
})
