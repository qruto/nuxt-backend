import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PANEL_TABS } from '../../devtools-client-app/app/nav'
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

  it('has a component for every tab, rendered by the shell, and none outside the tabs', () => {
    const panels = readdirSync(join(panelDir, 'app/components/panel')).map(file => file.replace(/\.vue$/, '')).sort()
    const tabs = PANEL_TABS.map(tab => tab.label).sort()
    expect(panels).toEqual(tabs)
    const shell = readFileSync(join(panelDir, 'app/app.vue'), 'utf-8')
    for (const tab of PANEL_TABS) expect(shell, tab.id).toContain(`<Panel${tab.label}`)
  })

  it('is one page: no router, no app manifest, no SPA fallbacks', () => {
    const config = readFileSync(join(panelDir, 'nuxt.config.ts'), 'utf-8')
    expect(config).toMatch(/pages: false/)
    expect(config).toMatch(/appManifest: false/)
    expect(config).toContain(`ignore: ['/200.html', '/404.html']`)
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

  const fakeBridge = () => {
    const bridge = {
      version: 3 as const,
      emit: (_snapshot: unknown) => {},
      getSnapshot: () => ({ connection: 'idle', activity: [] }),
      on: vi.fn((_: string, callback: (snapshot: unknown) => void) => (bridge.emit = callback, () => {})),
      activate: vi.fn(),
    }
    return bridge
  }

  it('attaches a version 3 bridge, activates it once and follows its snapshots', () => {
    const store = createPanelStore()
    const bridge = fakeBridge()
    store.attachBridge(bridge as never)
    store.attachBridge(bridge as never)
    expect(store.state.bridge).toBe('attached')
    expect(bridge.activate).toHaveBeenCalledOnce()
    expect(bridge.on).toHaveBeenCalledOnce()
    bridge.emit({ connection: 'connected', activity: [] })
    expect(store.state.snapshot).toEqual({ connection: 'connected', activity: [] })
  })

  it('reports a bridge from another version as outdated', () => {
    const store = createPanelStore()
    store.attachBridge({ version: 2 })
    expect(store.state.bridge).toBe('outdated')
    expect(store.state.snapshot).toBeNull()
  })

  it('marks the activity seen up to the newest entry', () => {
    const store = createPanelStore()
    store.markActivitySeen()
    expect(store.state.activitySeen).toBe(0)
    const bridge = fakeBridge()
    store.attachBridge(bridge as never)
    bridge.emit({ activity: [{ id: 4 }, { id: 5 }] })
    store.markActivitySeen()
    expect(store.state.activitySeen).toBe(5)
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
