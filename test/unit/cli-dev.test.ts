import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adoptBackendDevScript, backendDevScript, devScriptFinding, nuxtDevCommand, runDev, shellQuote, splitDevArgs, type DevSteps } from '../../src/cli/dev'
import { isEnvProvisioned, markEnvProvisioned, type EnvPushRunResult } from '../../src/env-push'

let rootDir: string

beforeEach(() => {
  // The shell running the suite may name a deployment of its own.
  vi.stubEnv('CONVEX_DEPLOYMENT', undefined)
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-dev-'))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

const writeManifest = (scripts: Record<string, string>, indent = 2) =>
  writeFileSync(join(rootDir, 'package.json'), `${JSON.stringify({ name: 'app', private: true, scripts }, null, indent)}\n`)
const readScripts = () => (JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as { scripts: Record<string, string> }).scripts
const configureDeployment = (deployment: string) => writeFileSync(join(rootDir, '.env.local'), `CONVEX_DEPLOYMENT=${deployment}\n`)

const cleanPush: EnvPushRunResult = {
  deployment: 'dev:brave-fox-123',
  dev: true,
  missingRequired: [],
  results: [{ action: { name: 'AUTH_SECRET', action: 'provision', detail: 'generated' }, outcome: 'set' }],
}

/** Steps that record the Convex commands; `onOnce` stands in for what `convex dev --once` writes. */
function recordingSteps(overrides: Partial<DevSteps> & { onOnce?: () => void } = {}) {
  const convexCalls: { args: string[], env: NodeJS.ProcessEnv }[] = []
  const lines: string[] = []
  const steps: DevSteps = {
    convex: async (args, env) => {
      convexCalls.push({ args, env })
      if (args.includes('--once')) {
        overrides.onOnce?.()
        return 1 // a new deployment's first push fails on the env it lacks
      }
      return 0
    },
    envPush: vi.fn(async () => cleanPush),
    log: line => lines.push(line),
    ...overrides,
  }
  return { steps, convexCalls, lines }
}

describe('runDev', () => {
  it('starts Convex and Nuxt straight away on a provisioned deployment', async () => {
    mkdirSync(join(rootDir, 'backend'))
    configureDeployment('dev:brave-fox-123')
    markEnvProvisioned(rootDir, 'dev:brave-fox-123')
    const { steps, convexCalls } = recordingSteps()

    expect(await runDev(rootDir, [], steps)).toBe(0)
    expect(convexCalls.map(call => call.args)).toEqual([['dev', '--start', 'nuxt dev']])
    expect(steps.envPush).not.toHaveBeenCalled()
  })

  it('on a first run: sets a deployment up, provisions its env, then starts', async () => {
    mkdirSync(join(rootDir, 'backend'))
    const { steps, convexCalls } = recordingSteps({ onOnce: () => configureDeployment('dev:brave-fox-123') })

    expect(await runDev(rootDir, ['--port', '3001'], steps)).toBe(0)
    expect(convexCalls.map(call => call.args)).toEqual([
      ['dev', '--once', '--typecheck', 'disable'],
      ['dev', '--start', 'nuxt dev --port 3001'],
    ])
    expect(steps.envPush).toHaveBeenCalledOnce()
    expect(isEnvProvisioned(rootDir, 'dev:brave-fox-123')).toBe(true)
  })

  it('stops when the first run was interrupted, even if it got as far as a deployment', async () => {
    mkdirSync(join(rootDir, 'backend'))
    const { steps, convexCalls } = recordingSteps({
      convex: async (args, env) => {
        convexCalls.push({ args, env })
        configureDeployment('dev:brave-fox-123')
        return 130
      },
    })

    expect(await runDev(rootDir, [], steps)).toBe(130)
    expect(convexCalls.map(call => call.args)).toEqual([['dev', '--once', '--typecheck', 'disable']])
    expect(steps.envPush).not.toHaveBeenCalled()
  })

  it('stops when no deployment was configured', async () => {
    mkdirSync(join(rootDir, 'backend'))
    const { steps, convexCalls, lines } = recordingSteps()

    expect(await runDev(rootDir, [], steps)).toBe(1)
    expect(convexCalls.map(call => call.args)).toEqual([['dev', '--once', '--typecheck', 'disable']])
    expect(lines.at(-1)).toContain('No deployment is configured')
  })

  it('still starts after a failed env set, and leaves no marker so the next start retries', async () => {
    mkdirSync(join(rootDir, 'backend'))
    configureDeployment('dev:brave-fox-123')
    const failed: EnvPushRunResult = { ...cleanPush, results: [{ ...cleanPush.results[0]!, outcome: 'failed', error: 'offline' }] }
    const { steps, convexCalls, lines } = recordingSteps({ envPush: vi.fn(async () => failed) })

    expect(await runDev(rootDir, [], steps)).toBe(0)
    expect(convexCalls.at(-1)?.args).toEqual(['dev', '--start', 'nuxt dev'])
    expect(lines).toContain('env push: AUTH_SECRET failed — offline')
    expect(isEnvProvisioned(rootDir, 'dev:brave-fox-123')).toBe(false)
  })

  it('never provisions a deployment that is not dev-class', async () => {
    mkdirSync(join(rootDir, 'backend'))
    configureDeployment('prod:steady-owl-456')
    const { steps } = recordingSteps()

    await runDev(rootDir, [], steps)
    expect(steps.envPush).not.toHaveBeenCalled()
  })

  it('scaffolds backend/ before Convex runs, so Convex never creates convex/', async () => {
    const { steps } = recordingSteps({ onOnce: () => configureDeployment('dev:brave-fox-123') })

    await runDev(rootDir, [], steps)
    expect(existsSync(join(rootDir, 'backend/convex.config.ts'))).toBe(true)
    expect(existsSync(join(rootDir, 'convex'))).toBe(false)
  })

  it('puts the app\'s node_modules/.bin first on PATH for the command Convex starts', async () => {
    mkdirSync(join(rootDir, 'backend'))
    configureDeployment('dev:brave-fox-123')
    markEnvProvisioned(rootDir, 'dev:brave-fox-123')
    const { steps, convexCalls } = recordingSteps()

    await runDev(rootDir, [], steps)
    expect(convexCalls[0]!.env.PATH?.split(delimiter)[0]).toBe(join(rootDir, 'node_modules/.bin'))
  })
})

describe('arguments', () => {
  it('splits --cwd off and forwards the rest to nuxt dev', () => {
    expect(splitDevArgs(['--cwd', 'app', '--port', '3001'])).toEqual({ cwd: 'app', nuxtArgs: ['--port', '3001'] })
    expect(splitDevArgs(['--cwd=app', '--host'])).toEqual({ cwd: 'app', nuxtArgs: ['--host'] })
    expect(splitDevArgs([])).toEqual({ cwd: '.', nuxtArgs: [] })
  })

  it('quotes only what the shell would split or expand', () => {
    expect(shellQuote('--port=3001')).toBe('--port=3001')
    expect(shellQuote('my app')).toBe('"my app"')
    expect(shellQuote('$HOME')).toBe('"\\$HOME"')
    expect(nuxtDevCommand(['--dotenv', '.env.local', 'two words'])).toBe('nuxt dev --dotenv .env.local "two words"')
  })
})

describe('the dev script', () => {
  it('replaces a plain nuxt dev and the base module\'s combined script, keeping their arguments', () => {
    expect(backendDevScript('nuxt dev')).toBe('nuxt-backend dev')
    expect(backendDevScript('nuxi dev --port 3001')).toBe('nuxt-backend dev --port 3001')
    expect(backendDevScript(`convex dev --start 'nuxt dev'`)).toBe('nuxt-backend dev')
    expect(backendDevScript(`convex dev --start "nuxt dev"`)).toBe('nuxt-backend dev')
    expect(backendDevScript(`convex dev --start "nuxt dev --host"`)).toBe('nuxt-backend dev --host')
    expect(backendDevScript(undefined)).toBe('nuxt-backend dev')
  })

  it('leaves a script the app wrote itself alone', () => {
    expect(backendDevScript('nuxt dev && echo done')).toBeNull()
    expect(backendDevScript('concurrently "convex dev" "nuxt dev"')).toBeNull()
  })

  it('writes the manifest in its own indentation, once', () => {
    writeManifest({ dev: 'nuxt dev', build: 'nuxt build' }, 4)
    expect(adoptBackendDevScript(rootDir)).toEqual({ script: 'nuxt-backend dev', changed: true })
    expect(readScripts()).toEqual({ dev: 'nuxt-backend dev', build: 'nuxt build' })
    expect(readFileSync(join(rootDir, 'package.json'), 'utf-8')).toContain('\n    "name"')
    expect(adoptBackendDevScript(rootDir)).toEqual({ script: 'nuxt-backend dev', changed: false })
  })

  it('with onlyCombined, repairs only the combined script', () => {
    writeManifest({ dev: 'nuxt dev' })
    expect(adoptBackendDevScript(rootDir, { onlyCombined: true })).toBeNull()
    expect(readScripts().dev).toBe('nuxt dev')

    writeManifest({ dev: `convex dev --start 'nuxt dev'` })
    expect(adoptBackendDevScript(rootDir, { onlyCombined: true })).toEqual({ script: 'nuxt-backend dev', changed: true })

    // What nuxt-convex-module 0.11+ writes.
    writeManifest({ dev: `convex dev --start "nuxt dev"` })
    expect(adoptBackendDevScript(rootDir, { onlyCombined: true })).toEqual({ script: 'nuxt-backend dev', changed: true })
  })

  it('doctor warns about the combined script only', () => {
    writeManifest({ dev: 'nuxt dev' })
    expect(devScriptFinding(rootDir)).toEqual([])
    writeManifest({ dev: `convex dev --start 'nuxt dev'` })
    expect(devScriptFinding(rootDir)).toMatchObject([{ id: 'dev-script', status: 'warn' }])
    writeManifest({ dev: `convex dev --start "nuxt dev"` })
    expect(devScriptFinding(rootDir)).toMatchObject([{ id: 'dev-script', status: 'warn' }])
  })
})
