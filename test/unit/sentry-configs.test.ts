import { afterEach, describe, expect, it, vi } from 'vitest'

// The package's own config files for the error-reporting SDK, loaded as the
// SDK's module loads them, with the SDK mocked: what each passes to `init`.
// The module's choice of `monitoring.tunnel`, and the boots that make it, are
// in test/unit/monitoring-app.test.ts and test/module/dev-server-boot.test.ts.

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  /** `serveTunnelIntegration`, or `undefined` as an SDK before 11.10 has it. */
  serveTunnel: undefined as undefined | ((options?: { allowedDsns?: string[] }) => unknown),
  monitoring: { dsn: 'https://key@o7.ingest.monitor.test/42', environment: 'production', tunnel: true } as Record<string, unknown>,
}))

vi.mock('@sentry/nuxt', () => ({
  init: sdk.init,
  consoleLoggingIntegration: () => ({ name: 'ConsoleLogs' }),
  // Read when the config loads: the factory runs once for the file.
  get serveTunnelIntegration() {
    return sdk.serveTunnel
  },
}))
vi.mock('#imports', () => ({ useRuntimeConfig: () => ({ public: { backend: { monitoring: sdk.monitoring } } }) }))
vi.mock('nuxt/server', () => ({ useRuntimeConfig: () => ({ public: { backend: { monitoring: sdk.monitoring } } }) }))

/** The options the config file at `path` passed to `init`, loaded fresh. */
async function initOf(file: 'client' | 'server'): Promise<Record<string, unknown>> {
  vi.resetModules()
  sdk.init.mockClear()
  await (file === 'client'
    ? import('../../src/runtime/monitoring/sdk/sentry.client.config')
    : import('../../src/runtime/monitoring/sdk/sentry.server.config'))
  expect(sdk.init).toHaveBeenCalledOnce()
  return sdk.init.mock.calls[0]![0] as Record<string, unknown>
}

const names = (options: Record<string, unknown>) => (options.integrations as { name: string }[]).map(integration => integration.name)

afterEach(() => {
  sdk.serveTunnel = undefined
  sdk.monitoring = { dsn: 'https://key@o7.ingest.monitor.test/42', environment: 'production', tunnel: true }
})

describe('the package\'s browser config', () => {
  it('reports through the managed tunnel when the module says its server answers it', async () => {
    expect(await initOf('client')).toMatchObject({ dsn: 'https://key@o7.ingest.monitor.test/42', tunnel: true })
  })

  it('reports straight to the ingest otherwise', async () => {
    sdk.monitoring = { ...sdk.monitoring, tunnel: false }
    expect(await initOf('client')).not.toHaveProperty('tunnel')
  })
})

describe('the package\'s server config', () => {
  it('answers the tunnel for the DSN the build gave the browser, and no other', async () => {
    sdk.serveTunnel = vi.fn((options?: { allowedDsns?: string[] }) => ({ name: 'ServeTunnel', options }))
    const options = await initOf('server')
    expect(sdk.serveTunnel).toHaveBeenCalledWith({ allowedDsns: ['https://key@o7.ingest.monitor.test/42'] })
    expect(names(options)).toContain('ServeTunnel')
  })

  it('starts on an SDK before 11.10, which has no tunnel to serve', async () => {
    const options = await initOf('server')
    expect(names(options)).not.toContain('ServeTunnel')
  })
})
