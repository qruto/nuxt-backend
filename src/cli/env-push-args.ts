import { parseArgs, type ArgsDef } from 'citty'
import { BACKEND_ENV_NAMES } from '../env-push'
import { DERIVED_DEPLOYMENT_ENV } from '../env-registry'

/**
 * A string flag given without a value — last, or followed by another flag —
 * as `--flag=`: the flag parser would otherwise take the next flag for its
 * value (`--preview --json`), or drop the bare flag altogether.
 */
export function bareFlags(rawArgs: readonly string[], flags: readonly string[]): string[] {
  return rawArgs.map((arg, index) => {
    const next = rawArgs[index + 1]
    return flags.includes(arg) && (next === undefined || next.startsWith('-')) ? `${arg}=` : arg
  })
}

/**
 * What a bare `--force` (or `all`) replaces: every variable of the
 * contract but `BACKEND_ENVIRONMENT`, which is derived from the
 * deployment's kind and replaced only when named.
 */
const EVERY_NAME: readonly string[] = BACKEND_ENV_NAMES.filter(name => !DERIVED_DEPLOYMENT_ENV.has(name))

/** The names `--force` gives, as written; empty for a bare one. */
function forcedNames(raw: unknown): string[] {
  return typeof raw === 'string' ? raw.split(',').map(name => name.trim()).filter(Boolean) : []
}

/** Whether `--force` asks for every name: bare, or `all`. */
function forcesEveryName(raw: unknown): boolean {
  const names = forcedNames(raw)
  return raw === true || (typeof raw === 'string' && names.length === 0) || names.some(name => name.toLowerCase() === 'all')
}

/**
 * `--force` for `env push`: which already-set deployment values may be
 * replaced by the local ones. A bare `--force` (or `all`) names every
 * variable of the contract but `BACKEND_ENVIRONMENT`; `--force A,B` only
 * those. Rotation has to be asked for — the plan reads deployment env NAMES
 * only, never values, so it cannot tell a rotated secret from an identical
 * one and must not guess. Null when `--force` was not given.
 */
export function parseForce(raw: unknown): ReadonlySet<string> | null {
  if (raw === undefined || raw === false || (raw !== true && typeof raw !== 'string')) return null
  const named = forcedNames(raw).filter(name => name.toLowerCase() !== 'all').map(name => name.toUpperCase())
  return new Set(forcesEveryName(raw) ? [...EVERY_NAME, ...named] : named)
}

/**
 * Why `--force` is refused, or null. On production a bare `--force` (or
 * `all`) would replace every value there with `.env.local`'s, which are
 * the dev deployment's: its local `SITE_URL` and its keys. There it names
 * what it replaces.
 */
export function forceRefusal(raw: unknown, { prod }: { prod: boolean }): string | null {
  if (!prod || !forcesEveryName(raw)) return null
  return 'env push --prod refused: a bare --force (or all) would replace every value on production with .env.local\'s, which are the dev deployment\'s. Name what to replace, such as --force BILLING_ACCESS_TOKEN.'
}

/** `env push`'s raw arguments parsed, with a bare `--preview` (no name) and a bare `--force` (every name) read as such. */
export function parseEnvPushArgs<T extends ArgsDef>(rawArgs: readonly string[], args: T): ReturnType<typeof parseArgs<T>> {
  return parseArgs<T>(bareFlags(rawArgs, ['--preview', '--force']), args)
}
