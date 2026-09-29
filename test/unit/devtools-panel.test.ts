import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PANEL_PAGES } from '../../devtools-client-app/app/nav'
import { createPanelStore, type PanelRpc } from '../../devtools-client-app/app/composables/store'
import { connectionSignal, findingSignal, outcomeSignal, subscriptionSignal } from '../../devtools-client-app/app/utils/signal'
import type { DevtoolsServerInfo } from '../../src/devtools/rpc-types'

const panelDir = join(process.cwd(), 'devtools-client-app')

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? vueFiles(path) : entry.name.endsWith('.vue') ? [path] : []
  })
}

describe('the panel', () => {
  it('carries the site\'s mark as its tab icon, byte for byte', () => {
    expect(readFileSync(join(panelDir, 'public/icon.svg'), 'utf-8'))
      .toBe(readFileSync(join(process.cwd(), 'website/public/favicon.svg'), 'utf-8'))
  })

  it('has a page file for every nav entry, and no page outside the nav', () => {
    const pages = readdirSync(join(panelDir, 'app/pages')).map(file => file.replace(/\.vue$/, '')).sort()
    const navigated = PANEL_PAGES.map(page => page.to === '/' ? 'index' : page.to.slice(1)).sort()
    expect(pages).toEqual(navigated)
  })

  it('uses only the three signals and grey, and names no provider in its labels', () => {
    for (const file of vueFiles(join(panelDir, 'app'))) {
      const source = readFileSync(file, 'utf-8')
      expect(source, file).not.toMatch(/\bn="(?:blue|orange|primary|cyan|purple|teal|yellow)"/)
      expect(source.replace(/<code[^>]*>[\s\S]*?<\/code>/g, ''), file).not.toMatch(/\b(?:Convex|Polar|Resend|Better Auth|Stripe)\b/)
    }
  })
})

describe('signals', () => {
  it('map every status the panel shows onto ok, warn, err or off', () => {
    expect([findingSignal('pass'), findingSignal('warn'), findingSignal('fail')]).toEqual(['ok', 'warn', 'err'])
    expect(['ok', 'duplicate', 'unknown_type', 'invalid_signature', 'handler_error'].map(outcomeSignal)).toEqual(['ok', 'off', 'warn', 'err', 'err'])
    expect(subscriptionSignal({ status: 'active' })).toBe('ok')
    expect(subscriptionSignal({ status: 'active', cancelAtPeriodEnd: true })).toBe('warn')
    expect(subscriptionSignal({ status: 'past_due' })).toBe('err')
    expect(subscriptionSignal({})).toBe('off')
    expect([connectionSignal('connected'), connectionSignal('reconnecting'), connectionSignal('closed'), connectionSignal(null)]).toEqual(['ok', 'warn', 'err', 'off'])
  })
})

describe('createPanelStore', () => {
  const info = { functionsDir: 'backend' } as DevtoolsServerInfo
  const rpcWith = (overrides: Partial<PanelRpc> = {}): PanelRpc => ({
    getInfo: vi.fn(async () => info),
    getDeploymentEnv: vi.fn(async () => ({ status: 'ok' as const, readAt: 1 })),
    runDoctor: vi.fn(async () => ({ ranAt: 1, findings: [] })),
    getCatalog: vi.fn(async () => ({ status: 'missing' as const, meters: [], plans: [], packs: [], features: [], synced: [] })),
    resolveBackendSource: vi.fn(async (file: string) => ({ filepath: `/app/backend/${file}` })),
    ...overrides,
  })

  it('attaches a version 2 bridge and follows its snapshots', () => {
    const store = createPanelStore()
    let emit: (snapshot: unknown) => void = () => {}
    store.attachBridge({ version: 2, getSnapshot: () => ({ connection: 'idle' }), on: (_: string, callback: (snapshot: unknown) => void) => (emit = callback, () => {}) } as never)
    expect(store.state.bridge).toBe('attached')
    emit({ connection: 'connected' })
    expect(store.state.snapshot).toEqual({ connection: 'connected' })
  })

  it('reports a bridge from another version as outdated', () => {
    const store = createPanelStore()
    store.attachBridge({ version: 1 })
    expect(store.state.bridge).toBe('outdated')
    expect(store.state.snapshot).toBeNull()
  })

  it('reads the deployment env, then the info that now counts it', async () => {
    const store = createPanelStore()
    const rpc = rpcWith()
    store.connect(rpc)
    const reading = store.readDeploymentEnv(true)
    expect(store.state.deploymentEnvLoading).toBe(true)
    await reading
    expect(rpc.getDeploymentEnv).toHaveBeenCalledWith({ refresh: true })
    expect(store.state.info).toEqual(info)
    expect(store.state.deploymentEnvLoading).toBe(false)
  })

  it('runs doctor once at a time', async () => {
    const store = createPanelStore()
    const rpc = rpcWith()
    store.connect(rpc)
    await Promise.all([store.runDoctor(), store.runDoctor()])
    expect(rpc.runDoctor).toHaveBeenCalledOnce()
    expect(store.state.doctor).toEqual({ ranAt: 1, findings: [] })
  })

  it('takes pushed info, and resolves sources through the dev server', async () => {
    const store = createPanelStore()
    store.receiveInfo(info)
    expect(store.state.info).toEqual(info)
    expect(await store.resolveSource('auth.ts')).toBeUndefined()
    store.connect(rpcWith())
    expect(await store.resolveSource('auth.ts')).toBe('/app/backend/auth.ts')
  })
})
