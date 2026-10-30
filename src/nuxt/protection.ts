import { createRequire } from 'node:module'
import { join } from 'node:path'
import { addNitroPlugin, addPlugin, addServerHandler, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { readEnvFiles } from '../env-push'
import { logger } from './logger'

// Bot protection on the app's side: what the browser is told
// (`runtimeConfig.public.backend.botDetection` and `.challengeSiteKey`), the
// bot check in front of the auth proxy, the proof route for the calls that
// skip it, and the challenge's place in the security headers. BotID needs
// no Nuxt module of its own (Vercel's get-started, checked 2026-10-25): its
// client and `checkBotId()` are wired here, and `botid` is an optional
// peer, installed for the check on Vercel.

/** Whether this build runs on Vercel, where BotID can check requests: never the dev server. */
function onVercel(nuxt: Nuxt): boolean {
  return !nuxt.options.dev && process.env.VERCEL === '1'
}

/** The BotID entry points the runtime imports. */
const BOTID_ENTRIES = ['botid/client/core', 'botid/server'] as const

/** Whether `botid` resolves from the app's root, as its build would find it. */
export function botIdInstalled(rootDir: string): boolean {
  try {
    createRequire(join(rootDir, 'package.json')).resolve('botid')
    return true
  }
  catch {
    return false
  }
}

/**
 * Register bot protection. Nothing here is a switch: on Vercel BotID runs,
 * with a site key the challenge does, and the deployment decides what it
 * requires from its own env.
 */
export function registerProtection(resolver: Resolver, nuxt: Nuxt): void {
  const dev = nuxt.options.dev
  // .env.local is development's: a build never bakes in its values (its test
  // site key would ship to production).
  const files = dev ? readEnvFiles(nuxt.options.rootDir) : {}
  const backend = nuxt.options.runtimeConfig.public.backend
  const botId = botIdInstalled(nuxt.options.rootDir)
  backend.botDetection = onVercel(nuxt) && botId
  if (onVercel(nuxt) && !botId) {
    logger.warn('This build runs on Vercel without botid installed, so no bot check runs on the app\'s server. Install it for the check: npm install botid.')
  }
  // Without the optional peer, its entry points resolve to a stand-in, so
  // the bundle builds; the build never runs either (`botDetection` is off).
  if (!botId) {
    const absent = resolver.resolve('./runtime/protection/botid-absent')
    nuxt.options.alias ||= {}
    nuxt.options.nitro.alias ||= {}
    for (const entry of BOTID_ENTRIES) {
      nuxt.options.alias[entry] = absent
      nuxt.options.nitro.alias[entry] = absent
    }
  }
  // Public: a challenge's site key is meant for the page. Its name is the
  // runtime config's own override (NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY),
  // so a deployed server takes it from its env at runtime too.
  backend.challengeSiteKey = process.env.NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY ?? files.NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY ?? ''

  // The dev server signs proofs with the secret .env.local holds, the one
  // `env push` sends to the dev deployment. A build never bakes it in: a
  // deployed server reads it from its own env at runtime.
  if (dev && !process.env.PROTECTION_PROOF_SECRET && files.PROTECTION_PROOF_SECRET) {
    process.env.PROTECTION_PROOF_SECRET = files.PROTECTION_PROOF_SECRET
  }
  // Off Vercel no bot check runs on the app's server, so it signs no proof:
  // a deployment that takes proofs and no challenge answer refuses everyone.
  if (!dev && !onVercel(nuxt) && process.env.PROTECTION_PROOF_SECRET && !backend.challengeSiteKey) {
    logger.warn('PROTECTION_PROOF_SECRET is set for a build that is not on Vercel: no bot check runs on this app\'s server, so it signs no proof, and a deployment that takes proofs only refuses every sign-in code request. Off Vercel, use the challenge keys (NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY, PROTECTION_CHALLENGE_SECRET_KEY).')
  }

  // Global middleware matched in-handler, as the agent gate is: the
  // protected auth routes sit under the auth proxy's own route, which the
  // base module mounts, and it answers the proof route
  // (`/api/human-proof`) itself.
  // On `nuxt/server` (the gate) and importing only it (the CSP plugin): one
  // file each serves both Nitro majors.
  addServerHandler({ middleware: true, handler: { nuxt: resolver.resolve('./runtime/server/protection/gate') } })
  const csp = resolver.resolve('./runtime/server/protection/csp')
  addNitroPlugin({ nitro2: csp, nitro3: csp })
  addPlugin({ src: resolver.resolve('./runtime/vue/plugins/protection.client'), mode: 'client' })
}
