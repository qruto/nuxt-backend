import type { Component } from 'vue'
import { ANALYTICS_VIEWS, type AdminTabView } from './admin-views'

// The admin console's tabs. The built-in ones are `ADMIN_TABS`, in the order
// it shows them: adding one is one entry here and its label
// (`admin.tabs.<key>` in src/convex/labels.ts), and the console, its
// keyboard, its `?tab=` address and its lazy loading come with the entry. A
// tab that shows a registered component names it, so a same-named component
// of the app's replaces it here too. The app's own tabs are pages under the
// console's path with `adminTab` in their page meta; `adminAppTabs` reads
// them off the router and `AdminConsole.vue` merges the two lists by `order`.

/** One built-in tab of the admin console. */
export interface AdminTab {
  /** Its key: its `?tab=` value, its `data-admin-tab` hook and its label, `admin.tabs.<key>`. */
  key: string
  /** Where it sits among the others: lower first. The app's tabs without an `order` come after every built-in one. */
  order: number
  /** A registered component it shows, by name: `AdminConsole.vue` resolves it the way Nuxt resolves a tag. */
  component?: 'AdminUsers' | 'AdminWorkspaces' | 'AuditLog'
  /** Its panel otherwise, loaded the first time the tab opens. */
  panel?: () => Promise<Component | { default: Component }>
  /** What the panel is given. */
  props?: Record<string, unknown>
  /** The backend file the tab reads (`backend/<needs>.ts`): the console shows the tab only while the app has it. */
  needs?: string
  /** A function of that file the tab calls, re-exported from its setup: the console shows the tab only while the file exports it. */
  has?: string
  /** Whether the app has what the tab shows, from the public runtime config (`runtimeConfig.public.backend`); shown always without it. */
  when?: (config: Record<string, unknown>) => boolean
  /** Views the tab holds, each with the backend file and function it reads: the tab shows while the app has any of them, in place of `needs` and `has`. */
  anyOf?: readonly AdminTabView[]
}

/**
 * The built-in tabs, ten apart so an app's tab can sit between any two. The
 * first is the one the console opens on. A tab with `needs` or `when` shows
 * only once the app has what it shows.
 */
export const ADMIN_TABS: readonly AdminTab[] = [
  { key: 'users', order: 10, component: 'AdminUsers' },
  { key: 'workspaces', order: 20, component: 'AdminWorkspaces' },
  // The whole activity trail, for administrators (`listAllActivity`).
  { key: 'activity', order: 30, component: 'AuditLog', props: { scope: 'all' } },
  // Reported content, notices and appeals, once backend/admin.ts passes `reports` (`getReports`, `decideReport`, …).
  { key: 'reports', order: 40, panel: () => import('./AdminReports.vue'), when: config => config.reports === true },
  // The kill switches and the app's feature flags (`listFlags`, `setFlag`).
  { key: 'flags', order: 50, panel: () => import('./AdminFlags.vue') },
  // The launch phase, invite codes, access links and invitations by address (`getAccessConsole`, …).
  { key: 'access', order: 60, panel: () => import('./AdminAccess.vue'), needs: 'access' },
  // The waiting people, admitted in waves (`getWaitlistConsole`, `admitWaitlist`, …).
  { key: 'waitlist', order: 70, panel: () => import('./AdminWaitlist.vue'), needs: 'waitlist' },
  // The notices everyone signed in sees, and the emails that go with them (`getAnnouncementsConsole`, `publishAnnouncement`, …).
  { key: 'announcements', order: 80, panel: () => import('./AdminAnnouncements.vue'), needs: 'email' },
  // What people sent through the contact form and by email (`getInboxConsole`, `replyToInbox`), once backend/email.ts re-exports them.
  { key: 'inbox', order: 90, panel: () => import('./AdminInbox.vue'), needs: 'email', has: 'getInboxConsole' },
  // The referral program's totals, top referrers and flagged queue (`getReferralConsole`, `resolveReferral`).
  { key: 'referrals', order: 100, panel: () => import('./AdminReferrals.vue'), needs: 'referrals' },
  // The billing lifecycle's records: save offers, withdrawals and renewal consent proofs (`getBillingConsole`).
  { key: 'billing', order: 110, panel: () => import('./AdminBilling.vue'), needs: 'billing', has: 'getBillingConsole' },
  // The job queue, once backend/jobs.ts defines one (`getQueue`, `listJobs`, `setQueue`, the dead letters).
  { key: 'queue', order: 120, panel: () => import('./AdminQueue.vue'), when: config => config.jobs === true },
  // What each person's AI calls cost, once backend/ai.ts re-exports `getCosts` from `ai.api`.
  { key: 'costs', order: 130, panel: () => import('./AdminCosts.vue'), needs: 'ai', has: 'getCosts' },
  // Revenue and usage from the billing provider, and the growth funnel: each view once the app re-exports what it reads.
  { key: 'analytics', order: 140, panel: () => import('./AdminAnalytics.vue'), anyOf: ANALYTICS_VIEWS },
  // The webhook delivery log of both providers, with a replay per delivery, once the app has backend/webhooks.ts.
  { key: 'webhooks', order: 150, panel: () => import('./AdminWebhooks.vue'), needs: 'webhooks' },
  // The addresses the email provider stopped delivering to, lifted one by one, once backend/email.ts re-exports `getSuppressions`.
  { key: 'suppressions', order: 160, panel: () => import('./AdminSuppressions.vue'), needs: 'email', has: 'getSuppressions' },
  // Every app capability's state, in the detail the health endpoint gives an administrator.
  { key: 'system', order: 170, panel: () => import('./AdminSystem.vue') },
]

/**
 * What a page of the app says to join the console's tab bar:
 * `definePageMeta({ adminTab: { label, icon, order } })` on a page under the
 * console's path (`app/pages/admin/featured.vue` is `/admin/featured`).
 */
export interface AdminTabMeta {
  /** The tab's words. */
  label: string
  /** An icon class (`i-lucide-star`) drawn before the label, for an app that has an icon set; the label always shows. */
  icon?: string
  /** Where the tab sits: lower first. The built-in tabs are 10 to 170, ten apart. Default: after them. Equal orders sort by label. */
  order?: number
}

/** The default `order` of an app's tab: after the built-in ones. */
export const DEFAULT_APP_TAB_ORDER = 1000

/** An app's tab, read off a route: where it goes and how it shows. */
export interface AdminAppTab {
  /** Its `data-admin-tab` hook: `app:` and the route's path below the console's. */
  key: string
  /** The page's path. */
  path: string
  label: string
  icon?: string
  order: number
}

/** The route fields a tab is read from. */
interface RouteLike {
  path: string
  meta?: Record<string, unknown>
}

/** A path without its trailing slash (`/` stays). */
function trimmed(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

/** `adminTab` as page meta gives it, or `null` when it is not an object with a label. */
export function readAdminTab(value: unknown): AdminTabMeta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { label, icon, order } = value as Record<string, unknown>
  if (typeof label !== 'string' || !label.trim()) return null
  return {
    label,
    ...(typeof icon === 'string' && icon ? { icon } : {}),
    ...(typeof order === 'number' && Number.isFinite(order) ? { order } : {}),
  }
}

/**
 * Sort tabs by `order`, then by label (so two tabs that share an `order` are
 * listed the same way every time).
 */
export function sortAdminTabs<T extends { order: number, label: string }>(tabs: readonly T[]): T[] {
  return [...tabs].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

/**
 * The app's tabs among a router's routes: every page below `adminPath` whose
 * meta names an `adminTab`. A page whose path has a parameter has no one
 * address to link to, so it has no tab. A page that says `adminTab` twice
 * (a route and its alias) counts once.
 */
export function adminAppTabs(routes: readonly RouteLike[], adminPath: string): AdminAppTab[] {
  const base = trimmed(adminPath)
  const seen = new Set<string>()
  const tabs: AdminAppTab[] = []
  for (const route of routes) {
    const path = trimmed(route.path)
    const meta = readAdminTab(route.meta?.adminTab)
    if (!meta || !path.startsWith(`${base}/`) || path.includes(':') || seen.has(path)) continue
    seen.add(path)
    tabs.push({ key: `app:${path.slice(base.length + 1)}`, path, label: meta.label, icon: meta.icon, order: meta.order ?? DEFAULT_APP_TAB_ORDER })
  }
  return sortAdminTabs(tabs)
}

/**
 * The app tab a route belongs to: the one whose page it is, or a page below
 * it (`/admin/featured/12` belongs to `/admin/featured`). The deepest wins.
 */
export function activeAppTab<T extends { path: string }>(tabs: readonly T[], path: string): T | undefined {
  const here = trimmed(path)
  return tabs
    .filter(tab => here === tab.path || here.startsWith(`${tab.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
}
