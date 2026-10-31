import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { finding, type PreflightFinding } from '../../findings'
import { resolveFunctionsDir } from '../../scaffold'

// --- doctor: the growth funnel's activation step ---

/** `activation: 'app.…'` as `setupAudit` takes it, in the source of `backend/audit.ts`. */
const ACTIVATION = /\bactivation:\s*['"`](app(?:\.[a-z][a-z0-9_]*)+)['"`]/

/** A source without its comments: a kind named only in a comment is neither named nor recorded. */
const codeOf = (path: string): string => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every `.ts` file of the functions directory but the generated ones, by path. */
function backendSources(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '_generated' || entry.name === 'node_modules') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...backendSources(path))
    else if (/\.ts$/.test(entry.name) && !/\.(?:test|spec)\.ts$/.test(entry.name)) files.push(path)
  }
  return files
}

/**
 * Whether the app records the activation it names: a kind of its own
 * (`app.…`) that `setupAudit({ activation })` names in `backend/audit.ts`
 * and no other backend file mentions leaves the funnel's activation step at
 * zero. A package kind, and no activation named (an account's first
 * `app.*` event counts), say nothing.
 *
 * @internal
 */
export function activationFindings(rootDir: string): PreflightFinding[] {
  const dir = join(rootDir, resolveFunctionsDir(rootDir))
  const auditFile = join(dir, 'audit.ts')
  if (!existsSync(auditFile)) return []
  const kind = ACTIVATION.exec(codeOf(auditFile))?.[1]
  if (!kind) return []
  // The kind as a string literal, in any of the three quotes.
  const literals = ['\'', '"', '`'].map(quote => `${quote}${kind}${quote}`)
  const recorded = backendSources(dir).some(path => path !== auditFile && literals.some(literal => codeOf(path).includes(literal)))
  if (recorded) return [finding('analytics-activation', 'pass', `${kind}, the funnel's activation, is recorded by a backend file.`)]
  return [finding(
    'analytics-activation',
    'warn',
    `setupAudit({ activation }) names ${kind}, which no backend file records: the growth funnel's activation step stays at zero.`,
    `Record it where a person first gets value: \`await audit.recordBackendEvent(ctx, { type: '${kind}' })\`, or name the kind you do record.`,
  )]
}
