// Shared between the module (server side of the DevTools RPC) and the panel
// app in `devtools-client-app/` (browser side) — keep this file dependency-free.

export const RPC_NAMESPACE = 'nuxt-backend'

/** Route the panel iframe is served under (sirv when built, proxy in dev). */
export const DEVTOOLS_UI_ROUTE = '/__nuxt-backend'

/** Port `pnpm dev:devtools-client` runs the panel dev server on (3630 is the base module's). */
export const DEVTOOLS_UI_LOCAL_PORT = 3631

/** A preflight finding as shown in the panel (same shape as `src/preflight.ts`). */
export interface DevtoolsPreflightFinding {
  id: string
  title: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  fixHint: string
}

/** One mounted (or app-shadowed) ready-made page. */
export interface DevtoolsPageInfo {
  key: string
  path: string
  /** Mounted behind the `auth` route middleware. */
  auth: boolean
  /** An app page at the same path won — the module skipped its own. */
  shadowed: boolean
}

/**
 * Presence booleans for the deployment env contract — never the values.
 * Secrets must not cross the DevTools RPC (it is same-origin-open in dev).
 */
export interface DevtoolsEnvPresence {
  required: Record<string, boolean>
  optional: Record<string, boolean>
}

/** The agent (MCP) surface as configured. */
export interface DevtoolsMcpStatus {
  enabled: boolean
  route?: string
  /** Built-in tool names surviving `backend.mcp.tools.builtin` config. */
  builtinTools: string[]
}

/** `appConfig.backend.billing.plans` entry (display catalog, not billing truth). */
export interface DevtoolsCatalogPlan {
  key: string
  credits?: number
  blurb?: string
  features?: string[]
  highlight?: boolean
}

/** `appConfig.backend.billing.packs` entry. */
export interface DevtoolsCatalogPack {
  key: string
  credits?: number
  blurb?: string
}

/** The `appConfig.backend` content layer the shipped pages render from. */
export interface DevtoolsAppConfigSnapshot {
  billing: {
    plans: DevtoolsCatalogPlan[]
    packs: DevtoolsCatalogPack[]
  }
  brand: {
    name?: string
    logo?: string
  }
}

/** Redacted module-options snapshot — wiring flags only, no env values. */
export interface DevtoolsOptionsSnapshot {
  installation: string
  /** Auto-scaffold missing backend files on dev startup (`backend.scaffold`). */
  scaffold: boolean
  /** Default stylesheet registered (`backend.css`). */
  css: boolean
  /** Dev-deployment env auto-provision (`backend.autoEnv`). */
  autoEnv: boolean
  authRoute: string
  /** Explicit `backend.loginPath` (`null` = resolved from the login page). */
  loginPath: string | null
  /** Whether the ready-made page set is enabled at all. */
  pagesEnabled: boolean
}

/**
 * Build-time facts only the dev server knows — everything live (identity,
 * billing, credits, workspace, webhook deliveries) flows through the in-page
 * bridge instead, since that state lives in the inspected app's browser
 * context, not in Node. Findings are re-collected on every `getInfo` call.
 */
export interface DevtoolsServerInfo {
  /** Functions dir relative to the app root (e.g. `backend`). */
  functionsDir: string
  options: DevtoolsOptionsSnapshot
  pages: DevtoolsPageInfo[]
  findings: DevtoolsPreflightFinding[]
  env: DevtoolsEnvPresence
  appConfig: DevtoolsAppConfigSnapshot
  mcp: DevtoolsMcpStatus
  /** Installed versions of the packages that matter for a bug report. */
  versions: Record<string, string>
}

/** Called from the panel iframe, executed in the Nuxt dev server. */
export interface ServerFunctions {
  getInfo(): DevtoolsServerInfo
  /** Map a backend source file (`"billing.ts"`) to its path for open-in-editor. */
  resolveBackendSource(file: string): { filepath?: string }
}

/** None yet — browser state reaches the panel via the bridge, not birpc. */
export type ClientFunctions = Record<string, never>
