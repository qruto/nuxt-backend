import { reactive } from 'vue'
import type {
  DevtoolsCatalogSummary,
  DevtoolsDeploymentEnv,
  DevtoolsDoctorRun,
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
  /** The newest activity entry the Activity tab has shown (0: none yet). */
  activitySeen: number
}

/** The dev server functions the panel calls (each over the RPC, so async). */
export interface PanelRpc {
  getInfo(): Promise<DevtoolsServerInfo>
  getDeploymentEnv(options?: { refresh?: boolean }): Promise<DevtoolsDeploymentEnv>
  runDoctor(): Promise<DevtoolsDoctorRun>
  getCatalog(): Promise<DevtoolsCatalogSummary>
  resolveBackendSource(file: string): Promise<{ filepath?: string }>
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
    activitySeen: 0,
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
    async loadCatalog() {
      if (!rpc) return
      state.catalog = await rpc.getCatalog()
    },
    request(section: DevtoolsOnDemandSection) {
      bridge?.request(section)
    },
    lookupEmail(emailId: string) {
      bridge?.lookupEmail(emailId)
    },
    async resolveSource(file: string): Promise<string | undefined> {
      return rpc ? (await rpc.resolveBackendSource(file)).filepath : undefined
    },
  }
}

export type PanelStore = ReturnType<typeof createPanelStore>
