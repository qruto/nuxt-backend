// The consent ledger's vocabulary and arithmetic: what a kind is, how a row
// reads against the latest version, the two kinds the package keeps for its
// own (`storage`, `age`), the storage purposes, and the checks on what an app
// declares. Pure (no Convex, no Better Auth, no Vue), so the `backend`
// component's rows, the app's `setupAccount`, the sign-in hooks and the
// browser's consent manager read the same names.

/** One consent an app declares in `setupAccount({ consents })`. */
export interface ConsentDeclaration {
  /** The document's or opt-in's version. Raise it when the text changes, and everyone is asked again. */
  version: string
  /** Where the document lives. Every prompt links to it. */
  url?: string
  /** `true`: a person must accept it to use the app, so sign-up asks for it. Otherwise it is an opt-in. */
  required?: boolean
  /** What the prompt calls it. Default: the `consent.kinds.<kind>` label, else the kind with spaces. */
  title?: string
}

/** The consents an app declares, by kind. */
export type ConsentDeclarations = Readonly<Record<string, ConsentDeclaration>>

/** The kind that holds a person's choice of optional storage: its version lists the purposes they allowed. */
export const STORAGE_KIND = 'storage'

/** The kind that records the age check: its version is the minimum age the person passed. */
export const AGE_KIND = 'age'

/** The kind the waitlist's launch-news box records, before sign-up by a hash of the address. */
export const LAUNCH_NEWS_KIND = 'launch-news'

/** The version the launch-news row carries: the box is the waitlist's own, not a document of the app's. */
export const LAUNCH_NEWS_VERSION = 'waitlist'

/** The kinds the package keeps for its own: an app's `consents` may not declare them. */
export const RESERVED_CONSENT_KINDS: readonly string[] = [STORAGE_KIND, AGE_KIND, LAUNCH_NEWS_KIND]

/** The longest kind, in characters. */
export const CONSENT_KIND_MAX = 40

/** What a kind looks like: lower-case words joined by `-` or `_`. */
const KIND_SHAPE = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/

/** What a version looks like: short and plain, so it reads in an export and in a URL. */
const VERSION_SHAPE = /^[\w.:+-]{1,40}$/

/** Why a declaration is refused, or `null`. */
export function declarationProblem(kind: string, declaration: ConsentDeclaration): string | null {
  if (!KIND_SHAPE.test(kind) || kind.length > CONSENT_KIND_MAX) return `\`${kind}\` is no kind name: use lower-case words joined by - or _, at most ${CONSENT_KIND_MAX} characters.`
  if (RESERVED_CONSENT_KINDS.includes(kind)) return `\`${kind}\` is a kind the package keeps for its own (${RESERVED_CONSENT_KINDS.join(', ')}): name yours otherwise.`
  if (typeof declaration?.version !== 'string' || !VERSION_SHAPE.test(declaration.version)) return `\`${kind}\` needs a \`version\`: a short string such as '2026-10-01'.`
  if (declaration.url !== undefined && (typeof declaration.url !== 'string' || !declaration.url.trim())) return `\`${kind}\` has an empty \`url\`.`
  return null
}

/** Throw the first problem with an app's declarations. */
export function assertDeclarations(consents: ConsentDeclarations | undefined, what: string): void {
  for (const [kind, declaration] of Object.entries(consents ?? {})) {
    const problem = declarationProblem(kind, declaration)
    if (problem) throw new Error(`[nuxt-backend] ${what}: ${problem}`)
  }
}

/** The kinds an app marks `required`. */
export function requiredKinds(consents: ConsentDeclarations | undefined): string[] {
  return Object.entries(consents ?? {}).filter(([, declaration]) => declaration.required).map(([kind]) => kind)
}

/** A kind's latest decision of one person. */
export interface ConsentDecision {
  version: string
  granted: boolean
  at: number
}

/** Whether a decision stands for the latest version: granted, not withdrawn, and at that version. */
export function isCurrent(decision: ConsentDecision | null | undefined, latest: string): boolean {
  return Boolean(decision && decision.granted && decision.version === latest)
}

// ── Optional storage ─────────────────────────────────────────────────────

/** A purpose of optional storage: the last-sign-in-method cookie (`preferences`), session replay (`replay`) or an analytics tool of yours (`analytics`). */
export type StoragePurpose = 'preferences' | 'replay' | 'analytics'

/** What optional storage is for. Each purpose is off until a person allows it. */
export const STORAGE_PURPOSES: readonly StoragePurpose[] = ['preferences', 'replay', 'analytics']

/** A person's choice, by purpose: `true` allowed, `false` declined. */
export type StorageChoice = Partial<Record<StoragePurpose, boolean>>

/** The cookie that keeps a browser's choice, readable by the page and by the auth route (never HttpOnly). */
export const STORAGE_COOKIE = 'backend.storage'

/** How long the browser keeps its choice: six months, then it asks again. */
export const STORAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 182

/** What a choice that allows nothing reads as, in the cookie and the ledger's `version`: asked, and declined. */
export const STORAGE_NONE = 'none'

/** The purposes a value of the cookie or of a ledger row allows, or `null` when it holds no choice. */
export function parseStorage(value: unknown): StoragePurpose[] | null {
  if (typeof value !== 'string' || !value) return null
  if (value === STORAGE_NONE) return []
  const allowed = value.split(',').filter((part): part is StoragePurpose => (STORAGE_PURPOSES as readonly string[]).includes(part))
  return allowed.length > 0 ? STORAGE_PURPOSES.filter(purpose => allowed.includes(purpose)) : null
}

/** The value of the cookie and of a ledger row for the purposes allowed: `preferences,replay`, or `none`. */
export function encodeStorage(allowed: readonly StoragePurpose[]): string {
  const ordered = STORAGE_PURPOSES.filter(purpose => allowed.includes(purpose))
  return ordered.length > 0 ? ordered.join(',') : STORAGE_NONE
}

/** Whether a purpose is allowed by a cookie header's value of the choice. */
export function storageAllows(value: unknown, purpose: StoragePurpose): boolean {
  return parseStorage(value)?.includes(purpose) ?? false
}

/** The cookie's value in a `Cookie` request header, or `undefined`. */
export function storageFromCookieHeader(header: string | null | undefined): string | undefined {
  for (const pair of (header ?? '').split(';')) {
    const at = pair.indexOf('=')
    if (at > 0 && pair.slice(0, at).trim() === STORAGE_COOKIE) {
      try {
        return decodeURIComponent(pair.slice(at + 1).trim())
      }
      catch {
        return undefined
      }
    }
  }
  return undefined
}

// ── The age check ────────────────────────────────────────────────────────

/** The body field a typed age rides in, on the code check. */
export const AGE_FIELD = 'age'

/** The oldest age the question accepts: a typo above it is asked again. */
export const AGE_MAX = 120

/** How long a browser that answered under the minimum stays refused, in seconds. */
export const UNDER_AGE_SECONDS = 24 * 60 * 60

/** The age a body field holds, or `null` for anything that is no whole number from 0 to {@link AGE_MAX}. */
export function readAge(value: unknown): number | null {
  const age = typeof value === 'string' && /^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : value
  return typeof age === 'number' && Number.isInteger(age) && age >= 0 && age <= AGE_MAX ? age : null
}

/** The version the age row carries: the minimum the person passed. */
export function ageVersion(minimumAge: number): string {
  return String(minimumAge)
}
