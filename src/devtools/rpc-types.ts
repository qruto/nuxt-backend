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
 * Presence booleans over the two-tier deployment env contract — never the
 * values. Secrets must not cross the DevTools RPC (it is same-origin-open in
 * dev).
 */
export interface DevtoolsEnvTier {
  required: Record<string, boolean>
  optional: Record<string, boolean>
}

/** The env names set on the deployment, read with `convex env list --names-only`. */
export interface DevtoolsDeploymentEnv {
  status: 'ok' | 'unavailable'
  /** Why the names could not be read: no deployment, not a dev one, the CLI failed. */
  reason?: string
  /** When the names were read (ms since epoch). */
  readAt: number
  names?: DevtoolsEnvTier
}

/** Where the env contract's names are visible. */
export interface DevtoolsEnvPresence {
  /** In the dev server: `.env`, `.env.local` and its process env. */
  visible: DevtoolsEnvTier
  /** On the deployment, as last read; `null` until the panel asks. */
  deployment: DevtoolsDeploymentEnv | null
}

/**
 * The deployment the app talks to, by what `CONVEX_DEPLOYMENT` (or
 * `CONVEX_SELF_HOSTED_URL`) says. `cloud-dev`, `local` and `anonymous` are the
 * dev-class kinds the dev server provisions.
 */
export type DevtoolsDeploymentKind = 'cloud-dev' | 'local' | 'anonymous' | 'self-hosted' | 'production' | 'preview' | 'none'

export interface DevtoolsDeployment {
  kind: DevtoolsDeploymentKind
  /** The `CONVEX_DEPLOYMENT` id, e.g. `dev:brave-fox-123`. */
  id?: string
  /** The client URL — public already (it reaches the browser). */
  url?: string
  /** The HTTP-actions origin. */
  siteUrl?: string
  /** The deployment's dashboard page, for cloud deployments. */
  dashboardUrl?: string
}

/** One built-in agent tool: its OAuth scope and whether config left it on. */
export interface DevtoolsMcpTool {
  name: string
  scope: string
  enabled: boolean
}

/** The agent (MCP) surface as configured. */
export interface DevtoolsMcpStatus {
  enabled: boolean
  route?: string
  /** Where the endpoint exchanges an agent's OAuth token for a deployment token. */
  exchangePath?: string
  tools: DevtoolsMcpTool[]
  /** Every scope an agent can be granted. */
  scopes: string[]
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
  /** The organization plugin runs (`backend.workspaces`). */
  workspaces: boolean
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
 * context, not in Node. Findings are re-collected on every `getInfo` call and
 * pushed with `onInfo` when an env file or the codegen changes.
 */
export interface DevtoolsServerInfo {
  /** Functions dir relative to the app root (e.g. `backend`). */
  functionsDir: string
  options: DevtoolsOptionsSnapshot
  deployment: DevtoolsDeployment
  pages: DevtoolsPageInfo[]
  findings: DevtoolsPreflightFinding[]
  env: DevtoolsEnvPresence
  mcp: DevtoolsMcpStatus
  /** Installed versions of the packages that matter for a bug report. */
  versions: Record<string, string>
}

/** One `doctor` run from the panel: the same checks as the CLI, never with `--prod`. */
export interface DevtoolsDoctorRun {
  ranAt: number
  findings: DevtoolsPreflightFinding[]
  /** Set when the run itself failed. */
  error?: string
}

/** The billing catalog as code: declared keys, and where `billing sync` has run. */
export interface DevtoolsCatalogSummary {
  /** `missing` without a `billing.catalog.ts`; `error` when it does not load. */
  status: 'ok' | 'missing' | 'error'
  error?: string
  meters: string[]
  plans: string[]
  packs: string[]
  features: string[]
  /** Environments `billing.generated.ts` has ids for (`sandbox`, `production`). */
  synced: string[]
}

/** Called from the panel iframe, executed in the Nuxt dev server. */
export interface ServerFunctions {
  getInfo(): DevtoolsServerInfo
  /**
   * The env names set on a dev deployment (a Convex CLI call, cached for a
   * minute; `refresh` reads again). Never production: the panel reports
   * `unavailable` for any other deployment.
   */
  getDeploymentEnv(options?: { refresh?: boolean }): Promise<DevtoolsDeploymentEnv>
  /**
   * Run `nuxt-backend doctor`'s checks in the dev server against the dev
   * deployment. One run at a time; a second call joins the running one.
   */
  runDoctor(): Promise<DevtoolsDoctorRun>
  /** Read `billing.catalog.ts` and `billing.generated.ts` afresh. */
  getCatalog(): Promise<DevtoolsCatalogSummary>
  /** Map a backend source file (`"billing.ts"`) to its path for open-in-editor. */
  resolveBackendSource(file: string): { filepath?: string }
}

/** Called from the dev server, executed in the panel iframe. */
export interface ClientFunctions {
  /** The dev server's facts changed: an env file, the codegen, the deployment env read. */
  onInfo(info: DevtoolsServerInfo): void
}
