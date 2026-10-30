// Shared between the module (server side of the DevTools RPC) and the panel
// app in `devtools-client-app/` (browser side) — keep it free of runtime
// imports: type imports only.

import type { AnalyzeReport } from '../analyze/types.js'
import type { CapabilityStatus } from '../capabilities/types.js'

export const RPC_NAMESPACE = 'nuxt-backend'

/** Route the panel iframe is served under (a dev-server handler when built, a proxy in dev). */
export const DEVTOOLS_UI_ROUTE = '/__nuxt-backend'

/** Port `pnpm dev:devtools-client` runs the panel dev server on (3630 is the base module's). */
export const DEVTOOLS_UI_LOCAL_PORT = 3631

/**
 * The panel's tabs, by id, in order. The panel's own nav (`devtools-client-app/app/nav.ts`)
 * labels them; the capability registry names the tab that shows each capability.
 */
export const DEVTOOLS_PANELS = ['overview', 'account', 'billing', 'email', 'webhooks', 'monitoring', 'activity', 'bundles'] as const

export type DevtoolsPanelId = (typeof DEVTOOLS_PANELS)[number]

/** A preflight finding as shown in the panel (same shape as `src/findings/types.ts`). */
export interface DevtoolsPreflightFinding {
  id: string
  /** The app capability `doctor --only` selects it by. */
  capability?: string
  title: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  fixHint: string
  /** The finding's entry in the docs. */
  docsUrl?: string
}

/**
 * One app capability as the Overview's console shows it, as `nuxt-backend
 * status` reports it: its detected state, what it is built on, the env it
 * lacks and its most pressing finding. Names and states only: no env value
 * crosses the RPC.
 */
export type DevtoolsCapability = CapabilityStatus

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

/** How the panel, `nuxt-backend status` and a capability's reason name each kind of deployment. */
export const DEPLOYMENT_KIND_LABEL: Record<DevtoolsDeploymentKind, string> = {
  'cloud-dev': 'cloud dev deployment',
  'local': 'local deployment',
  'anonymous': 'local deployment, no account',
  'self-hosted': 'self-hosted backend',
  'production': 'production deployment',
  'preview': 'preview deployment',
  'none': 'no deployment configured',
}

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

/** Redacted module-options snapshot — wiring flags only, no env values. */
export interface DevtoolsOptionsSnapshot {
  authRoute: string
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
  /**
   * Every app capability, detected from the preflight's findings, the last doctor
   * run's and the deployment env names last read.
   */
  capabilities: DevtoolsCapability[]
  /**
   * When the doctor run the capabilities read ran: `null` before the first, and
   * again once an env file changes, which drops the run's findings.
   */
  doctorRanAt: number | null
  env: DevtoolsEnvPresence
  /** Installed versions of the packages that matter for a bug report. */
  versions: Record<string, string>
}

/** One `doctor` run from the panel: the same checks as the CLI, never with `--prod`. */
export interface DevtoolsDoctorRun {
  ranAt: number
  findings: DevtoolsPreflightFinding[]
  /** The run as `nuxt-backend doctor --json` prints it, to paste into an issue or an agent. */
  report?: string
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

/** One component: the import it mounts from, and whether the app's `convex.config.ts` mounts it. */
export interface DevtoolsMount {
  /** The component's name, `crons` for `@convex-dev/crons/convex.config`. */
  name: string
  from: string
  mounted: boolean
  /** The scaffold mounts it (as opposed to one the app added). */
  scaffold: boolean
}

/** One maintenance task's latest pass, as the backend component's `maintenance.status` reports it. */
export interface DevtoolsMaintenanceTask {
  task: string
  startedAt: number
  /** Absent until a pass has finished. */
  finishedAt?: number
  /** Rows the latest finished pass deleted; absent for a task that cannot count them. */
  pruned?: number
  totalPruned: number
  /** The error that ended the latest pass early, if one did. */
  error?: string
}

/**
 * The backend's wiring and upkeep: the mounts and route groups, read from
 * the app's own files against the scaffold's, and the component's
 * maintenance, read from a dev deployment with the Convex CLI.
 */
export interface DevtoolsBackendHealth {
  readAt: number
  mounts: DevtoolsMount[]
  /** Route groups the scaffold passes to `registerBackendRoutes` and `http.ts` does not. */
  missingRoutes: string[]
  maintenance:
    | { status: 'ok', tasks: DevtoolsMaintenanceTask[] }
    | { status: 'unavailable', reason: string }
}

/** One packaged email, as the dev deployment renders it with sample data. */
export interface DevtoolsEmailPreview {
  /** Unique among the previews: the template, with its variant (`otp-sign-in`). */
  key: string
  template: string
  /** Which form of the template: a code's purpose. */
  variant?: string
  /** When the package sends it. */
  note: string
  to: string
  subject: string
  text: string
  /** The HTML as a reader in light mode sees it, whatever the panel's theme. */
  html: string
  /** The same email in dark mode. */
  htmlDark: string
}

/**
 * The Email tab's previews: every packaged email in one language, from the
 * app's `email:previewEmails` on the dev deployment. `missing`: the app's
 * `backend/email.ts` does not export the preview functions;
 * `unavailable`: no dev deployment, or the CLI failed.
 */
export interface DevtoolsEmailPreviews {
  status: 'ok' | 'missing' | 'unavailable'
  reason?: string
  readAt: number
  /** The language the previews are written in. */
  locale?: string
  /** Every language the app's emails are written in, the default first. */
  locales: string[]
  previews: DevtoolsEmailPreview[]
}

/** A preview sent to a test address, or why not. */
export interface DevtoolsEmailPreviewSend {
  status: 'sent' | 'missing' | 'unavailable'
  reason?: string
  /** The sandbox address it went to. */
  to?: string
  /** The id `send` returned, to look up its delivery. */
  emailId?: string
}

/**
 * The Bundles tab: what the last `nuxt-backend analyze` run measured.
 * `empty`: no run has been made yet; `unavailable`: the run failed, with why.
 */
export interface DevtoolsBundles {
  status: 'ok' | 'empty' | 'unavailable'
  reason?: string
  /** The last run's report; its Convex bundle is the one the tab refreshes. */
  report?: AnalyzeReport
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
   * deployment, all of them or `only` some app capabilities. One run per selection
   * at a time; a second call for the same one joins it.
   */
  runDoctor(options?: { only?: string[] }): Promise<DevtoolsDoctorRun>
  /**
   * The mounts, the route groups and the maintenance health (a Convex CLI
   * call, cached for a minute; `refresh` reads again). The maintenance is
   * read from a dev deployment only.
   */
  getHealth(options?: { refresh?: boolean }): Promise<DevtoolsBackendHealth>
  /** Read `billing.catalog.ts` and `billing.generated.ts` afresh. */
  getCatalog(): Promise<DevtoolsCatalogSummary>
  /**
   * Every packaged email in `locale` (the default without one), as the dev
   * deployment renders it: a Convex CLI call, never against production.
   */
  getEmailPreviews(options?: { locale?: string }): Promise<DevtoolsEmailPreviews>
  /** Send one preview to one of the provider's test addresses through the dev deployment. */
  sendEmailPreview(options: { key: string, locale?: string }): Promise<DevtoolsEmailPreviewSend>
  /** The last `analyze` run, read from disk. It runs nothing. */
  getBundles(): Promise<DevtoolsBundles>
  /**
   * Measure the backend's bundle now, as `nuxt-backend analyze --only convex`
   * does: it bundles the functions again, so it runs only when the panel asks.
   * One run at a time; a second call joins it.
   */
  runBundles(): Promise<DevtoolsBundles>
  /** Map a backend source file (`"billing.ts"`) to its path for open-in-editor. */
  resolveBackendSource(file: string): { filepath?: string }
}

/** Called from the dev server, executed in the panel iframe. */
export interface ClientFunctions {
  /** The dev server's facts changed: an env file, the codegen, the deployment env read. */
  onInfo(info: DevtoolsServerInfo): void
}
