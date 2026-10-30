#!/usr/bin/env node
/**
 * The playground's dev server as `pnpm try` starts it, under portless:
 * `nuxt dev` for the website on the port portless gives it, with the local
 * deployment's `.env.local`.
 *
 * Portless knows the app's public origin only once it runs the app: with
 * `--tailscale` it is this machine's tailnet name on a port portless picks
 * (`PORTLESS_TAILSCALE_URL`). Auth trusts `SITE_URL` as the browser's
 * origin, so when the origin portless serves the app at is not the one
 * `pnpm try` set (argv[2]), the deployment's `SITE_URL` follows it first.
 * The review-notes endpoint takes notes from pages of that origin too
 * (`NUXT_TRY_KIT_ORIGIN`), beside this machine's own names.
 */
import { spawn } from 'node:child_process'
import { bin, convex, root, websiteDir } from './kit.mjs'

const expected = process.argv[2]
const served = process.env.PORTLESS_TAILSCALE_URL || process.env.PORTLESS_URL || expected

if (served && served !== expected) {
  // The value goes on stdin, never as an argument another process could read.
  await convex(['env', 'set', 'SITE_URL'], { input: served })
  console.log(`\x1B[36m[try]\x1B[0m SITE_URL is now ${served}, where the app is served.`)
}

// fallow-ignore-next-line security-sink -- the repository's own nuxt binary, no shell, fixed arguments; verified 2026-10-19
const nuxt = spawn(bin('nuxt'), ['dev', websiteDir, '--dotenv', '.env.local'], { cwd: root, stdio: 'inherit', env: { ...process.env, ...(served ? { NUXT_TRY_KIT_ORIGIN: served } : {}) } })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => nuxt.kill(signal))
nuxt.on('exit', (code, signal) => process.exit(code ?? (signal ? 130 : 1)))
