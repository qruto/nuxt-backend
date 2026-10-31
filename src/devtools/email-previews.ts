import { runConvex } from '../convex-cli'
import { forceColorScheme } from '../convex/email-scheme'
import { normalizeLocale } from '../convex/locale'
import { configuredDeployment, isDevDeployment } from '../env-push'
import type { DevtoolsEmailPreview, DevtoolsEmailPreviews, DevtoolsEmailPreviewSend } from './rpc-types'

// The DevTools Email tab's previews: the internal `previewEmails`
// and `sendEmailPreview` of `email.api`, re-exported from `backend/email.ts`, run with the Convex CLI on
// the dev deployment, so a preview is what that deployment would send (its
// templates, messages, brand and env), and a test send goes out through it.

/** The export line a `backend/email.ts` without the functions needs. */
export const PREVIEW_EXPORT = 'export const { getEmailStatus, previewEmails, sendEmailPreview } = email.api'

/** The one value of the deployment's answer the panel shows, as it answered. */
interface PreviewAnswer {
  locales?: unknown
  locale?: unknown
  previews?: Array<Record<string, unknown>>
}

/** Why the deployment cannot be asked, or `null` when it can: a configured dev deployment only. */
function refusal(rootDir: string): string | null {
  if (!configuredDeployment(rootDir)) return 'No deployment is configured yet (CONVEX_DEPLOYMENT).'
  if (!isDevDeployment(rootDir)) return 'The panel previews email on a dev deployment only.'
  return null
}

/**
 * What a failed `convex run` means here: the export missing (the deployment
 * has no such function, in the words the CLI passes on), or anything else, a
 * deployment or a project the CLI cannot find included.
 */
function failure(error: unknown): { status: 'missing' | 'unavailable', reason: string } {
  const text = `${error instanceof Error ? error.message : String(error)}\n${(error as { stderrTail?: string }).stderrTail ?? ''}`
  if (/could not find (?:public |internal )?function|no such function/i.test(text)) {
    return { status: 'missing', reason: `backend/email.ts does not export the preview functions. Add: ${PREVIEW_EXPORT}` }
  }
  return { status: 'unavailable', reason: 'The Convex CLI could not run email:previewEmails (is the dev deployment running this version?).' }
}

/** One preview as the panel shows it: its light and its dark rendering, whatever the panel's own theme. */
function toPreview(entry: Record<string, unknown>): DevtoolsEmailPreview | null {
  const { key, template, subject, to, html, text, note, variant } = entry
  if (typeof key !== 'string' || typeof template !== 'string' || typeof html !== 'string') return null
  return {
    key,
    template,
    ...(typeof variant === 'string' ? { variant } : {}),
    note: typeof note === 'string' ? note : '',
    to: typeof to === 'string' ? to : '',
    subject: typeof subject === 'string' ? subject : '',
    text: typeof text === 'string' ? text : '',
    html: forceColorScheme(html, 'light'),
    htmlDark: forceColorScheme(html, 'dark'),
  }
}

/**
 * Every packaged email in `locale`, as the dev deployment renders them:
 * `email:previewEmails`, run with the Convex CLI.
 */
export async function readEmailPreviews(rootDir: string, locale?: string, now: () => number = Date.now): Promise<DevtoolsEmailPreviews> {
  const refused = refusal(rootDir)
  if (refused) return { status: 'unavailable', reason: refused, readAt: now(), locales: [], previews: [] }
  const wanted = normalizeLocale(locale)
  try {
    const { stdout } = await runConvex(rootDir, ['run', 'email:previewEmails', JSON.stringify(wanted ? { locale: wanted } : {})], { timeout: 60_000 })
    const answer = JSON.parse(stdout) as PreviewAnswer
    const locales = Array.isArray(answer.locales) ? answer.locales.filter((entry): entry is string => typeof entry === 'string') : []
    return {
      status: 'ok',
      readAt: now(),
      locale: typeof answer.locale === 'string' ? answer.locale : undefined,
      locales,
      previews: (answer.previews ?? []).map(toPreview).filter((entry): entry is DevtoolsEmailPreview => entry !== null),
    }
  }
  catch (error) {
    return { ...failure(error), readAt: now(), locales: [], previews: [] }
  }
}

/**
 * Send one preview to a sandbox address through the dev deployment:
 * `email:sendEmailPreview`, which refuses any address but the provider's
 * sandbox ones.
 */
export async function sendEmailPreview(rootDir: string, options: { key: string, locale?: string }): Promise<DevtoolsEmailPreviewSend> {
  const refused = refusal(rootDir)
  if (refused) return { status: 'unavailable', reason: refused }
  // The key names a preview; nothing else reaches the command line.
  if (!/^[\w-]{1,64}$/.test(options.key)) return { status: 'unavailable', reason: 'That is not a preview\'s key.' }
  const locale = normalizeLocale(options.locale)
  const to = 'delivered@resend.dev'
  try {
    const { stdout } = await runConvex(rootDir, ['run', 'email:sendEmailPreview', JSON.stringify({ key: options.key, to, ...(locale ? { locale } : {}) })], { timeout: 60_000 })
    const emailId = JSON.parse(stdout) as unknown
    return { status: 'sent', to, ...(typeof emailId === 'string' ? { emailId } : {}) }
  }
  catch (error) {
    const { status, reason } = failure(error)
    return { status, reason: status === 'missing' ? reason : 'The preview was not sent: the Convex CLI could not run email:sendEmailPreview.' }
  }
}
