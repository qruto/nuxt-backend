// The auth secret, versioned: what `nuxt-backend env rotate AUTH_SECRET`
// writes and every signer of the package reads. Nothing here touches Convex,
// so the CLI, the component and the auth options share it.
//
// `AUTH_SECRET` holds either one plain secret (every app starts so) or a
// versioned list, current first: `<version>:<secret>,<version>:<secret>`.
// A version is the Unix second its secret began signing; `0` is the plain
// secret the list replaced. The current one signs everything new, and a
// previous one still verifies what it signed until the rotation retires it.

/** One secret of a versioned `AUTH_SECRET`. */
export interface AuthSecretEntry {
  /** The Unix second it began signing; `0` for the plain secret a first rotation kept. */
  version: number
  value: string
}

/** `AUTH_SECRET` read: the secret that signs, and the ones that still verify, newest first. */
export interface AuthSecrets {
  current: string
  previous: string[]
  /** The versioned entries, current first; `null` for a plain secret. */
  entries: AuthSecretEntry[] | null
}

/**
 * How long a previous secret keeps verifying after a rotation: 30 days, as
 * long as the session signing keys' public halves stay published and as
 * long as the law asks an unsubscribe link to keep working.
 */
export const AUTH_SECRET_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

const ENTRY = /^(\d{1,12}):(\S.*)$/

/**
 * Read an `AUTH_SECRET` value: a versioned list when every comma-separated
 * part is `<version>:<secret>`, else one plain secret. `null` when unset or
 * empty.
 */
export function parseAuthSecret(raw: string | undefined | null): AuthSecrets | null {
  const value = raw?.trim()
  if (!value) return null
  const parts = value.split(',').map(part => part.trim())
  const matched = parts.map(part => ENTRY.exec(part))
  if (parts.length === 0 || matched.some(match => !match)) return { current: value, previous: [], entries: null }
  const entries = matched.map(match => ({ version: Number(match![1]), value: match![2]!.trim() }))
  if (new Set(entries.map(entry => entry.version)).size !== entries.length) return { current: value, previous: [], entries: null }
  return { current: entries[0]!.value, previous: entries.slice(1).map(entry => entry.value), entries }
}

/** A versioned list as `AUTH_SECRET` holds it, current first. */
export function formatAuthSecret(entries: readonly AuthSecretEntry[]): string {
  return entries.map(entry => `${entry.version}:${entry.value}`).join(',')
}

function readEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}

/**
 * The deployment's auth secrets: the current one, which signs, and the
 * previous ones a rotation keeps verifying. Every signed link and keyed hash
 * of the package reads them here. `null` when `AUTH_SECRET` is unset.
 */
export function authSecrets(raw: string | undefined = readEnv('AUTH_SECRET')): AuthSecrets | null {
  return parseAuthSecret(raw)
}

/** Every live secret, current first: the ones a signature or a keyed hash is checked against. */
export function liveSecrets(secrets: AuthSecrets | null): string[] {
  return secrets ? [secrets.current, ...secrets.previous] : []
}

/**
 * The secret a keyed hash that is checked by recomputing it (a sign-in code)
 * is made with: the oldest live one. A rotation then changes nothing for a
 * code in flight, and only the retirement moves it to the current secret.
 */
export function oldestSecret(secrets: AuthSecrets): string {
  return secrets.previous.at(-1) ?? secrets.current
}

/**
 * The auth library's options for the secret: `secret` alone for a plain
 * one; for a versioned list, `secrets` with the current first and `secret`
 * as the fallback for what was encrypted before the first rotation (the
 * plain secret kept as version 0, else the current one).
 */
export function authLibrarySecretOptions(secrets: AuthSecrets | null): { secret?: string, secrets?: AuthSecretEntry[] } {
  if (!secrets) return {}
  if (!secrets.entries) return { secret: secrets.current }
  const legacy = secrets.entries.find(entry => entry.version === 0)?.value ?? secrets.current
  return { secret: legacy, secrets: secrets.entries.map(entry => ({ ...entry })) }
}

/** The secret configuration the auth library keeps on its context: one string, or its versioned keys. */
export type AuthLibrarySecretConfig = string | { keys: Map<number, string>, currentVersion: number, legacySecret?: string }

/**
 * The live secrets of an auth library context, current first: what a hook
 * or an endpoint checks a keyed value against. Falls back to `secret`.
 */
export function contextSecrets(context: { secret: string, secretConfig?: AuthLibrarySecretConfig }): string[] {
  const config = context.secretConfig
  if (!config || typeof config === 'string') return [context.secret]
  const current = config.keys.get(config.currentVersion) ?? context.secret
  const rest = [...config.keys.entries()].filter(([version]) => version !== config.currentVersion).sort(([a], [b]) => b - a).map(([, value]) => value)
  return [...new Set([current, ...rest, ...(config.legacySecret ? [config.legacySecret] : [])])]
}

/** The first answer `check` gives for one of `secrets` that is not `null`/`false`, tried in order. */
export async function firstVerified<T>(secrets: readonly string[], check: (secret: string) => Promise<T | null | false>): Promise<T | null> {
  for (const secret of secrets) {
    const result = await check(secret)
    if (result !== null && result !== false) return result
  }
  return null
}

/** Whether a rotation's previous secret may retire: the window since the current one began signing has passed. */
export function retirementDue(secrets: AuthSecrets, now: number, windowMs: number = AUTH_SECRET_WINDOW_MS): boolean {
  const started = secrets.entries?.[0]?.version
  return started === undefined || started * 1000 + windowMs <= now
}
