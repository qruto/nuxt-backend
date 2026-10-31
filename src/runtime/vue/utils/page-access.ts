import { createError, type NuxtError } from '#app'
import { ACCESS_DENIED_REASONS, PAGE_ACCESS_RULE_KEYS, type AccessDeniedData, type AccessDeniedReason, type PageAccessRules, type PageAuth } from './access-rules'
import type { AdminTabMeta } from '../components/admin/admin-tabs'
import { hasAnyRole } from './roles'

// The check itself, loaded with the first page that has rules (the page
// guard), and the 403 it answers with. What every navigation reads, a
// page's rules and the server-rendered path, is in ./page-rules.ts.

declare module '#app' {
  interface PageMeta {
    /**
     * Who may open the page: `true` for a sign-in, or rules, each of which
     * must pass after it. A signed-out visitor goes to the sign-in page with
     * `?redirect=`; a signed-in one who fails a rule gets a 403, or a 404
     * when the rules say `hidden: true`.
     */
    auth?: PageAuth
    /**
     * Puts a page under the admin console's path (`app/pages/admin/`) in its
     * tab bar: `{ label, icon, order }`. The page is a child of the console,
     * so the console's rules guard it too.
     */
    adminTab?: AdminTabMeta
  }
}

/** The signed-in person a page's rules are checked against. */
export interface AccessSubject {
  /** The app-wide role field (several comma-separated); `'user'` when unset. */
  role: string
  banned: boolean
  /** The role in the active workspace, or `null` without one. Called only when a rule needs it. */
  workspaceRole: () => Promise<string | null>
  /** Whether the active workspace's plan includes a feature. Called only when a rule needs it. */
  hasFeature: (feature: string) => Promise<boolean>
}

/**
 * Whether one record's rules pass on the app-wide role. A key that names no
 * rule (`roles`, `workspace_role`) fails: a typo closes the page rather
 * than open it to everyone signed in, and development names it.
 */
function passesAppRules(rule: PageAccessRules, subject: AccessSubject): boolean {
  const unknown = Object.keys(rule).filter(key => !(PAGE_ACCESS_RULE_KEYS as readonly string[]).includes(key))
  if (unknown.length > 0) {
    if (import.meta.dev) console.warn(`[nuxt-backend] definePageMeta({ auth }) names no rule ${unknown.map(key => `\`${key}\``).join(', ')}, so the page is refused. The rules are ${PAGE_ACCESS_RULE_KEYS.join(', ')}.`)
    return false
  }
  return rule.role === undefined || hasAnyRole(subject.role, rule.role)
}

/**
 * The first rule the person fails, or `null` when they may open the page:
 * a banned account fails every page with rules, then each app-wide rule
 * (a key that names no rule fails as one), then the workspace rules, whose
 * role is read only when one asks for it, then the plan's features, read
 * only when one asks for one.
 */
export async function accessDenial(rules: readonly PageAccessRules[], subject: AccessSubject): Promise<AccessDeniedReason | null> {
  if (subject.banned) return 'banned'
  if (!rules.every(rule => passesAppRules(rule, subject))) return 'role'
  const workspace = rules.flatMap(rule => (rule.workspace === undefined ? [] : [rule.workspace]))
  if (workspace.length > 0) {
    const role = await subject.workspaceRole()
    if (role === null || !workspace.every(required => required === true || hasAnyRole(role, required))) return 'workspace'
  }
  for (const rule of rules) {
    if (rule.feature !== undefined && !(typeof rule.feature === 'string' && rule.feature !== '' && await subject.hasFeature(rule.feature))) return 'feature'
  }
  return null
}

/** Whether a page's rules keep it private: any record that says `hidden: true`. */
export function isHidden(rules: readonly PageAccessRules[]): boolean {
  return rules.some(rule => rule.hidden === true)
}

/**
 * The page guard's answer to anyone a hidden page refuses: the 404 a page
 * that does not exist answers, so its existence stays private.
 */
export function hiddenPageError(path: string): NuxtError {
  return createError({ status: 404, fatal: true, data: { path } })
}

/**
 * The page guard's answer to a signed-in person who fails a rule: a fatal
 * 403, so the app's error page renders on a server render and on a
 * navigation in the browser alike. It names the rule failed, never the
 * role or the feature the page wants.
 */
export function accessDeniedError(reason: AccessDeniedReason, path: string): NuxtError<AccessDeniedData> {
  return createError<AccessDeniedData>({ status: 403, statusText: 'Forbidden', fatal: true, data: { reason, path } })
}

/** A same-origin base for reading a path the way a browser would. */
const SITE = 'http://site.invalid'

/**
 * `path` when it is a path of this site, `undefined` for anything a browser
 * would take to another origin: `//evil.example`, and `/\evil.example`,
 * which a browser reads as the same.
 */
export function sitePath(path: unknown): string | undefined {
  if (typeof path !== 'string' || !path.startsWith('/')) return undefined
  try {
    return new URL(path, SITE).origin === SITE ? path : undefined
  }
  catch {
    return undefined
  }
}

/**
 * What the page guard's 403 carries, read from an error page's `error`;
 * `undefined` for any other error. A server render hands the error page its
 * `data` as JSON text when the app turned Nuxt's `parseErrorData` off.
 */
export function accessDeniedData(error: unknown): AccessDeniedData | undefined {
  let data: unknown = (error as { data?: unknown } | null | undefined)?.data
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    }
    catch {
      return undefined
    }
  }
  const { reason, path } = (data ?? {}) as { reason?: unknown, path?: unknown }
  const known = ACCESS_DENIED_REASONS.find(candidate => candidate === reason)
  if (!known) return undefined
  // Only a path of this site: never a URL another origin could take over.
  return { reason: known, path: sitePath(path) ?? '/' }
}
