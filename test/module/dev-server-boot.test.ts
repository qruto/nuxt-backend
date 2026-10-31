import { existsSync } from 'node:fs'
import { posix, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { LOCAL_LOG_ROUTE } from '../../src/convex/constants'

// What the module does on a real `nuxt dev` boot, and on a Vercel build that
// reports errors: the paths registration.test.ts leaves out, since its dev
// boots are `nuxi prepare` or a test runner, which the module treats as
// neither. `loadNuxt` with `ready: true` against test/fixtures/registration
// sets the module up without building or serving anything; the module's log
// lines are read off the process streams, where consola writes them.

const posixPath = (path: string): string => path.split(sep).join('/')
const repoRoot = posixPath(fileURLToPath(new URL('../..', import.meta.url))).replace(/\/$/, '')
const fixtureDir = posix.join(repoRoot, 'test/fixtures/registration')
const runtimeDir = posix.join(repoRoot, 'src/runtime')

// A test runner holds consola to warnings and errors; the preflight's summary is an info line.
// Set before @nuxt/kit loads consola, which reads it once.
vi.hoisted(() => {
  process.env.CONSOLA_LEVEL = '3'
})

type Overrides = NonNullable<Parameters<typeof loadNuxt>[0]['overrides']>

/** Boot the fixture once for the suite, everything the module logs while it sets up kept in `written`. */
function useBoot(overrides: Record<string, unknown>, { dev }: { dev: boolean }) {
  const written: string[] = []
  let nuxt: Nuxt
  beforeAll(async () => {
    const streams = [process.stdout, process.stderr].map(stream => vi.spyOn(stream, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk))
      return true
    }))
    try {
      nuxt = await loadNuxt({ cwd: fixtureDir, dev, ready: true, overrides: { telemetry: false, ...overrides } as Overrides })
    }
    finally {
      for (const stream of streams) stream.mockRestore()
    }
  })
  afterAll(async () => {
    await nuxt?.close()
  })
  return { nuxt: () => nuxt, output: () => written.join('') }
}

const ourPlugins = (nuxt: Nuxt) => nuxt.options.plugins.map(plugin => typeof plugin === 'string' ? plugin : plugin.src).map(posixPath).filter(src => src.startsWith(runtimeDir))
const nitroPlugins = (nuxt: Nuxt) => ((nuxt as unknown as { _nitro?: { options: { plugins: string[] } } })._nitro?.options.plugins ?? []).map(posixPath)

// The machine running the tests may hold env of its own: each boot reads only what a suite sets.
beforeAll(() => {
  for (const name of ['MONITORING_DSN', 'SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN', 'VERCEL', 'SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'NUXT_PUBLIC_BACKEND_URL', 'NUXT_PUBLIC_CONVEX_URL', 'CONVEX_DEPLOYMENT']) vi.stubEnv(name, '')
})
afterAll(() => {
  vi.unstubAllEnvs()
  delete process.env.CONSOLA_LEVEL
})

describe('a nuxt dev boot', () => {
  beforeAll(() => {
    vi.stubEnv('NUXT_PUBLIC_CONVEX_URL', 'https://happy-otter-123.convex.cloud')
  })
  afterAll(() => {
    vi.stubEnv('NUXT_PUBLIC_CONVEX_URL', '')
  })
  const boot = useBoot({ test: false }, { dev: true })

  it('runs the environment preflight once, and says the platform\'s URL name has a neutral one', () => {
    const output = boot.output()
    expect(output).toContain('NUXT_PUBLIC_CONVEX_URL is set; NUXT_PUBLIC_BACKEND_URL is this package\'s own name for it (both work).')
    expect(output.split('backend preflight: ')).toHaveLength(2)
  })

  it('names what setup is missing, each with the fix it needs', () => {
    // The fixture's deployment holds no env: AUTH_SECRET and the rest are reported, not thrown.
    expect(boot.output()).toMatch(/AUTH_SECRET[\s\S]*↳ /)
    expect(boot.nuxt().options.dev).toBe(true)
  })

  it('mounts the local error log DevTools lists, with nuxt-security\'s validator and limiter off it', () => {
    const nuxt = boot.nuxt()
    expect(nuxt.options.serverHandlers.map(handler => handler.route)).toContain(LOCAL_LOG_ROUTE)
    expect(nuxt.options.routeRules?.[LOCAL_LOG_ROUTE]).toMatchObject({ security: { xssValidator: false, rateLimiter: false } })
    expect(ourPlugins(nuxt).filter(src => /monitoring-log\.client/.test(src))).toHaveLength(1)
    expect(nitroPlugins(nuxt).filter(plugin => /monitoring[\\/]local-log(?:\.ts)?$/.test(plugin))).toHaveLength(1)
  })

  it('registers the DevTools bridge after the plugins it reads, and writes nothing into the app', () => {
    const plugins = ourPlugins(boot.nuxt())
    const bridge = plugins.findIndex(src => /[\\/]devtools[\\/]plugin\.client/.test(src))
    expect(bridge).toBeGreaterThanOrEqual(0)
    expect(existsSync(posix.join(fixtureDir, 'convex.json'))).toBe(false)
  })
})

describe('a Vercel build that reports errors', () => {
  beforeAll(() => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('MONITORING_DSN', 'https://public-key@o7.ingest.monitor.test/42')
  })
  afterAll(() => {
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('MONITORING_DSN', '')
  })
  const boot = useBoot({}, { dev: false })

  it('says once that it uploads no source maps without the integration\'s names, and which are missing', () => {
    const warnings = boot.output().split('\n').filter(line => line.includes('uploads no source maps'))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('this Vercel build sees no SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT')
  })

  it('mounts no local error log outside dev', () => {
    expect(boot.nuxt().options.serverHandlers.map(handler => handler.route)).not.toContain(LOCAL_LOG_ROUTE)
  })
})
