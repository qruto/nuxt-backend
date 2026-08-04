import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineCommand } from 'citty'
import { scaffoldBackendFiles, resolveFunctionsDir } from '../scaffold'
import { FEATURES, type BackendInstallationMode } from '../templates'
import { collectPreflightFindings, formatPreflightSummary, type PreflightFinding } from '../preflight'

const ENV_EXAMPLE = `# Nuxt app (client + SSR)
NUXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
NUXT_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site

# Convex deployment — ALL required (a deploy fails until set); set with
# \`npx convex env set NAME value\`, not here:
#   AUTH_SECRET           $(openssl rand -base64 32)
#   SITE_URL              your app origin (auth base URL + invitation/gift links)
#   EMAIL_API_KEY         email; EMAIL_FROM, EMAIL_TEST_MODE, EMAIL_WEBHOOK_SECRET
#   BILLING_ACCESS_TOKEN  billing; BILLING_WEBHOOK_SECRET, BILLING_ENVIRONMENT=sandbox|production
`

const cwdArg = {
  cwd: { type: 'string' as const, description: 'Project directory', default: '.' },
}

function projectRoot(args: { cwd: string }): string {
  return resolve(process.cwd(), args.cwd)
}

/** Add 'nuxt-backend' to nuxt.config modules via magicast; false when not possible. */
async function addModuleToNuxtConfig(rootDir: string): Promise<boolean> {
  const configPath = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs']
    .map(name => join(rootDir, name))
    .find(existsSync)
  if (!configPath) return false
  try {
    const { loadFile, writeFile } = await import('magicast')
    const { addNuxtModule } = await import('magicast/helpers')
    const config = await loadFile(configPath)
    addNuxtModule(config, 'nuxt-backend')
    await writeFile(config, configPath)
    return true
  }
  catch {
    return false
  }
}

const init = defineCommand({
  meta: { name: 'init', description: 'Scaffold the Convex backend files, .env.example, and nuxt.config wiring' },
  args: {
    ...cwdArg,
    installation: { type: 'string', description: 'Scaffold mode: default | local', default: 'default' },
    force: { type: 'boolean', description: 'Overwrite existing scaffold files', default: false },
  },
  run({ args }) {
    const rootDir = projectRoot(args)
    scaffoldBackendFiles(rootDir, {
      installation: args.installation as BackendInstallationMode,
      force: args.force,
    })

    const envExamplePath = join(rootDir, '.env.example')
    if (args.force || !existsSync(envExamplePath)) {
      writeFileSync(envExamplePath, ENV_EXAMPLE)
      console.log('[nuxt-backend] Created .env.example')
    }

    return addModuleToNuxtConfig(rootDir).then((added) => {
      if (added) {
        console.log('[nuxt-backend] Added \'nuxt-backend\' to nuxt.config modules')
      }
      else {
        console.log('[nuxt-backend] Add the module yourself: modules: [\'nuxt-backend\'] in nuxt.config.ts')
      }
      if (args.installation === 'local') {
        console.log('[nuxt-backend] Local install: add \'@convex-dev/resend\' as a direct dependency (pnpm add @convex-dev/resend) so the local component config resolves it.')
      }
      console.log(`
Next steps:
  1. Set NUXT_PUBLIC_CONVEX_URL / NUXT_PUBLIC_CONVEX_SITE_URL (see .env.example)
  2. npx convex dev        # provisions the deployment + codegen
  3. Set the required deployment env (a deploy fails until all are set):
       npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"
       npx convex env set SITE_URL http://localhost:3000
       npx convex env set EMAIL_API_KEY <key>            # + EMAIL_FROM, EMAIL_TEST_MODE, EMAIL_WEBHOOK_SECRET
       npx convex env set BILLING_ACCESS_TOKEN <token>   # + BILLING_WEBHOOK_SECRET, BILLING_ENVIRONMENT
  4. npm run dev           # sign in with useAuth() / <AuthForm>
`)
    })
  },
})

const add = defineCommand({
  meta: { name: 'add', description: `Scaffold a feature file: ${Object.keys(FEATURES).join(' | ')}` },
  args: {
    ...cwdArg,
    feature: { type: 'positional', description: 'Feature to add', required: true },
    force: { type: 'boolean', description: 'Overwrite the existing file', default: false },
  },
  run({ args }) {
    const files = Object.hasOwn(FEATURES, args.feature) ? FEATURES[args.feature] : undefined
    if (!files) {
      console.error(`[nuxt-backend] Unknown feature "${args.feature}". Available: ${Object.keys(FEATURES).join(', ')}`)
      process.exitCode = 1
      return
    }
    const rootDir = projectRoot(args)
    scaffoldBackendFiles(rootDir, { files, force: args.force })

    const functionsDir = resolveFunctionsDir(rootDir)
    const httpPath = join(rootDir, functionsDir, 'http.ts')
    if ((args.feature === 'billing' || args.feature === 'email') && existsSync(httpPath)) {
      const http = readFileSync(httpPath, 'utf-8')
      if (!http.includes('registerBackendRoutes')) {
        console.warn(`[nuxt-backend] ${functionsDir}/http.ts doesn't call registerBackendRoutes — mount the ${args.feature} webhook there.`)
      }
    }
  },
})

/** Read deployment env var NAMES via `npx convex env list` (values never leave the CLI). */
function deploymentEnvNames(rootDir: string): string[] | null {
  try {
    // On Windows `npx` is `npx.cmd`; since Node's CVE-2024-27980 hardening,
    // spawning a `.cmd` without a shell throws EINVAL — so use a shell there.
    // Args are static literals (no interpolation), so shelling is injection-safe.
    const output = execFileSync('npx', ['convex', 'env', 'list'], {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
      shell: process.platform === 'win32',
    })
    return output
      .split('\n')
      .map(line => line.split('=')[0]?.trim() ?? '')
      .filter(name => /^[A-Z][A-Z0-9_]*$/.test(name))
  }
  catch {
    return null
  }
}

/** Minimal .env parser — enough for KEY=VALUE lines (dotenv-style). */
function readEnvFiles(rootDir: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const name of ['.env', '.env.local']) {
    const path = join(rootDir, name)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const match = line.match(/^([A-Z_]\w*)=(.*)$/i)
      if (match) env[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const doctor = defineCommand({
  meta: { name: 'doctor', description: 'Check the project + deployment configuration' },
  args: {
    ...cwdArg,
    json: { type: 'boolean', description: 'Machine-readable output', default: false },
  },
  run({ args }) {
    const rootDir = projectRoot(args)
    const env = { ...readEnvFiles(rootDir), ...process.env } as Record<string, string | undefined>

    const findings: PreflightFinding[] = collectPreflightFindings({
      env,
      siteUrlConfigured: Boolean(env.NUXT_PUBLIC_CONVEX_SITE_URL),
    })

    // Filesystem checks the startup preflight can't do.
    const functionsDir = resolveFunctionsDir(rootDir)
    const hasGenerated = existsSync(join(rootDir, functionsDir, '_generated'))
    findings.push({
      id: 'convex-codegen',
      title: 'Convex codegen',
      status: hasGenerated ? 'pass' : 'warn',
      message: hasGenerated
        ? `${functionsDir}/_generated present.`
        : `${functionsDir}/_generated missing — Convex features no-op until codegen runs.`,
      fixHint: hasGenerated ? '' : 'Run: npx convex dev',
    })

    // Deployment-side env presence (names only — values never read). Every
    // backend env var is required — a deploy fails while any is missing.
    const deployed = deploymentEnvNames(rootDir)
    if (deployed) {
      const requiredEnv = [
        'AUTH_SECRET',
        'SITE_URL',
        'EMAIL_API_KEY',
        'EMAIL_FROM',
        'EMAIL_TEST_MODE',
        'EMAIL_WEBHOOK_SECRET',
        'BILLING_ACCESS_TOKEN',
        'BILLING_WEBHOOK_SECRET',
        'BILLING_ENVIRONMENT',
      ] as const
      for (const name of requiredEnv) {
        findings.push({
          id: `deployment-${name.toLowerCase().replace(/_/g, '-')}`,
          title: `Deployment ${name}`,
          status: deployed.includes(name) ? 'pass' : 'fail',
          message: deployed.includes(name) ? `${name} is set on the deployment.` : `${name} is not set on the Convex deployment (required — a deploy fails without it).`,
          fixHint: deployed.includes(name) ? '' : `npx convex env set ${name} ...`,
        })
      }
    }
    else {
      findings.push({
        id: 'deployment-env',
        title: 'Deployment env',
        status: 'warn',
        message: 'Could not read the deployment env (no deployment configured, or `npx convex env list` failed).',
        fixHint: 'Run `npx convex dev` once to provision, then re-run doctor.',
      })
    }

    if (args.json) {
      console.log(JSON.stringify({ findings, summary: formatPreflightSummary(findings) }, null, 2))
    }
    else {
      const icon = { pass: '✓', warn: '⚠', fail: '✗' } as const
      for (const finding of findings) {
        console.log(`${icon[finding.status]} ${finding.title}: ${finding.message}${finding.fixHint ? `\n    ↳ ${finding.fixHint}` : ''}`)
      }
      console.log(`\n${formatPreflightSummary(findings)}`)
    }
    if (findings.some(finding => finding.status === 'fail')) {
      process.exitCode = 1
    }
  },
})

export const main = defineCommand({
  meta: {
    name: 'nuxt-backend',
    description: 'All-in-one SaaS backend for Nuxt on Convex — scaffold and check your project',
  },
  subCommands: { init, add, doctor },
})
