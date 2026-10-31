import { reactive } from 'vue'
import type {
  DevtoolsBackendHealth,
  DevtoolsBundles,
  DevtoolsCatalogSummary,
  DevtoolsDeploymentEnv,
  DevtoolsDoctorRun,
  DevtoolsEmailPreviews,
  DevtoolsEmailPreviewSend,
  DevtoolsPanelId,
  DevtoolsServerInfo,
} from '../../../src/devtools/rpc-types'
import type {
  BackendDevtoolsBridge,
  BackendDevtoolsSnapshot,
  DevtoolsOnDemandSection,
} from '../../../src/runtime/devtools/types'

/** Where the panel stands with the inspected app's bridge. */
export type BridgeStatus = 'looking' | 'attached' | 'missing' | 'outdated'

export interface PanelState {
  /** The DevTools iframe handshake completed. */
  connected: boolean
  bridge: BridgeStatus
  info: DevtoolsServerInfo | null
  snapshot: BackendDevtoolsSnapshot | null
  deploymentEnvLoading: boolean
  doctor: DevtoolsDoctorRun | null
  doctorRunning: boolean
  catalog: DevtoolsCatalogSummary | null
  /** The mounts, routes and maintenance (`null` until read). */
  health: DevtoolsBackendHealth | null
  healthLoading: boolean
  /** The Email tab's previews (`null` until read). */
  emailPreviews: DevtoolsEmailPreviews | null
  emailPreviewsLoading: boolean
  /** The last preview sent to a test address, or why it was not; `null` before one. */
  emailPreviewSend: (DevtoolsEmailPreviewSend & { key: string }) | null
  emailPreviewSending: boolean
  /** The Bundles tab's last run (`null` until read). */
  bundles: DevtoolsBundles | null
  bundlesRunning: boolean
  /** The newest activity entry the Activity tab has shown (0: none yet). */
  activitySeen: number
  /** The tab in view. */
  tab: DevtoolsPanelId
}

/** The dev server functions the panel calls (each over the RPC, so async). */
export interface PanelRpc {
  getInfo(): Promise<DevtoolsServerInfo>
  getDeploymentEnv(options?: { refresh?: boolean }): Promise<DevtoolsDeploymentEnv>
  runDoctor(options?: { only?: string[] }): Promise<DevtoolsDoctorRun>
  getCatalog(): Promise<DevtoolsCatalogSummary>
  getHealth(options?: { refresh?: boolean }): Promise<DevtoolsBackendHealth>
  resolveBackendSource(file: string): Promise<{ filepath?: string }>
  getBundles(): Promise<DevtoolsBundles>
  runBundles(): Promise<DevtoolsBundles>
  getEmailPreviews(options?: { locale?: string }): Promise<DevtoolsEmailPreviews>
  sendEmailPreview(options: { key: string, locale?: string }): Promise<DevtoolsEmailPreviewSend>
}

/**
 * The panel's state and actions, apart from the DevTools kit so they can be
 * tested. `connect` hands it the RPC once the iframe handshake completes;
 * `attachBridge` hands it the inspected app's bridge once it is found.
 */
export function createPanelStore() {
  const state = reactive<PanelState>({
    connected: false,
    bridge: 'looking',
    info: null,
    snapshot: null,
    deploymentEnvLoading: false,
    doctor: null,
    doctorRunning: false,
    catalog: null,
    health: null,
    healthLoading: false,
    emailPreviews: null,
    emailPreviewsLoading: false,
    emailPreviewSend: null,
    emailPreviewSending: false,
    bundles: null,
    bundlesRunning: false,
    activitySeen: 0,
    tab: 'overview',
  })
  let rpc: PanelRpc | null = null
  let bridge: BackendDevtoolsBridge | null = null

  return {
    state,
    connect(connection: PanelRpc) {
      rpc = connection
      state.connected = true
    },
    /** The dev server pushed fresh facts. */
    receiveInfo(info: DevtoolsServerInfo) {
      state.info = info
    },
    attachBridge(candidate: { version?: number }) {
      // DevTools hands the panel its client again on some host updates.
      if (candidate === bridge) return
      // A bridge from another version of the package: the inspected page was
      // loaded before an upgrade.
      if (candidate.version !== 3) {
        state.bridge = 'outdated'
        return
      }
      bridge = candidate as BackendDevtoolsBridge
      state.bridge = 'attached'
      state.snapshot = bridge.getSnapshot()
      bridge.on('snapshot', (snapshot) => {
        state.snapshot = snapshot
      })
      // The page starts its own queries (subscription, credits, deliveries…)
      // only now that someone is looking; a second call is a no-op.
      bridge.activate()
    },
    /** Bring a tab into view: the shell's nav, or a capability's channel on the Overview. */
    select(tab: DevtoolsPanelId) {
      state.tab = tab
    },
    /** The Activity tab is in view: everything recorded so far counts as seen. */
    markActivitySeen() {
      state.activitySeen = state.snapshot?.activity.at(-1)?.id ?? state.activitySeen
    },
    bridgeMissing() {
      state.bridge = 'missing'
    },
    async refresh() {
      if (!rpc) return
      state.info = await rpc.getInfo()
    },
    /** Read the deployment's env names (cached for a minute unless `refresh`). */
    async readDeploymentEnv(refresh = false) {
      if (!rpc) return
      state.deploymentEnvLoading = true
      try {
        await rpc.getDeploymentEnv({ refresh })
        state.info = await rpc.getInfo()
      }
      finally {
        state.deploymentEnvLoading = false
      }
    },
    async runDoctor() {
      if (!rpc || state.doctorRunning) return
      state.doctorRunning = true
      try {
        state.doctor = await rpc.runDoctor()
      }
      finally {
        state.doctorRunning = false
      }
    },
    /** Read the mounts and the maintenance health (cached for a minute unless `refresh`). */
    async readHealth(refresh = false) {
      if (!rpc) return
      state.healthLoading = true
      try {
        state.health = await rpc.getHealth({ refresh })
      }
      finally {
        state.healthLoading = false
      }
    },
    /** Read the last `analyze` run from disk; it measures nothing. */
    async loadBundles() {
      if (!rpc) return
      state.bundles = await rpc.getBundles()
    },
    /** Measure the backend's bundle again (it bundles the functions, so only on request); one run at a time. */
    async runBundles() {
      if (!rpc || state.bundlesRunning) return
      state.bundlesRunning = true
      try {
        state.bundles = await rpc.runBundles()
      }
      finally {
        state.bundlesRunning = false
      }
    },
    async loadCatalog() {
      if (!rpc) return
      state.catalog = await rpc.getCatalog()
    },
    /** Render every packaged email in `locale` on the dev deployment (never cached). */
    async loadEmailPreviews(locale?: string) {
      if (!rpc) return
      state.emailPreviewsLoading = true
      try {
        state.emailPreviews = await rpc.getEmailPreviews(locale ? { locale } : {})
      }
      finally {
        state.emailPreviewsLoading = false
      }
    },
    /** Send one preview to a test address; one send at a time. */
    async sendEmailPreview(key: string, locale?: string) {
      if (!rpc || state.emailPreviewSending) return
      state.emailPreviewSending = true
      try {
        state.emailPreviewSend = { key, ...await rpc.sendEmailPreview({ key, ...(locale ? { locale } : {}) }) }
      }
      finally {
        state.emailPreviewSending = false
      }
    },
    request(section: DevtoolsOnDemandSection) {
      bridge?.request(section)
    },
    lookupEmail(emailId: string) {
      bridge?.lookupEmail(emailId)
    },
    /** Ask a delivery's provider to send it again, as the inspected app's signed-in administrator. */
    replayWebhook(service: string, deliveryId: string) {
      bridge?.replayWebhook(service, deliveryId)
    },
    async resolveSource(file: string): Promise<string | undefined> {
      return rpc ? (await rpc.resolveBackendSource(file)).filepath : undefined
    },
  }
}

export type PanelStore = ReturnType<typeof createPanelStore>
