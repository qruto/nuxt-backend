import { type EmailId, Resend, type SendEmailOptions } from '@convex-dev/resend'
import { v } from 'convex/values'
import { Webhook } from 'svix'
import { sendArgs } from '../../email-validators.js'
import { components } from './_generated/api.js'
import { action, env, mutation, query } from './_generated/server.js'

/**
 * Email sending, served by the `backend` component itself via the nested Resend
 * component. Consumers get transactional email out of the box: mount `backend`
 * and set `EMAIL_API_KEY` — no extra component to install or wire.
 *
 * Configuration comes from the env vars declared on this component in
 * `convex.config.ts` and forwarded by the mounting app. They are read here
 * type-safely via the generated `env`:
 * - `EMAIL_API_KEY` — the provider API key (required on deploy; absent in
 *   tests/previews ⇒ defensive no-op, logs instead)
 * - `EMAIL_FROM` — default From address (falls back to the provider's onboarding sender)
 * - `EMAIL_TEST_MODE` — set to `"false"` to deliver to arbitrary recipients
 * - `EMAIL_WEBHOOK_SECRET` — verifies delivery/bounce/open webhooks
 */
function resendClient(): Resend {
  return new Resend(components.resend, {
    apiKey: env.EMAIL_API_KEY,
    testMode: env.EMAIL_TEST_MODE !== 'false',
    webhookSecret: env.EMAIL_WEBHOOK_SECRET,
  })
}

/**
 * Enqueue a transactional email through the nested Resend component.
 *
 * Exposed as a `public` component function so the parent app (e.g. the auth
 * flows, or `setupEmail`) can call it via `components.backend.email.send`.
 * Component functions are only reachable through the parent — never directly by
 * browser clients.
 */
export const send = mutation({
  args: sendArgs,
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    if (!env.EMAIL_API_KEY) {
      console.warn(
        `[nuxt-backend] Email skipped — the required EMAIL_API_KEY env var is missing on this deployment. `
        + `To ${Array.isArray(args.to) ? args.to.join(', ') : args.to}: ${args.subject ?? '(template)'}`,
      )
      return null
    }
    const from = args.from ?? env.EMAIL_FROM ?? 'onboarding@resend.dev'
    const common = {
      from,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      replyTo: args.replyTo,
      headers: args.headers,
    }
    const options = (args.template
      ? { ...common, subject: args.subject, template: args.template }
      : { ...common, subject: args.subject ?? '', html: args.html, text: args.text }) as SendEmailOptions
    return resendClient().sendEmail(ctx, options)
  },
})

/** Delivery status for a sent email (waiting → queued → sent → delivered/bounced/…). */
export const status = query({
  args: { emailId: v.string() },
  handler: async (ctx, args) => {
    return resendClient().status(ctx, args.emailId as EmailId)
  },
})

/** Full stored email record (recipients, subject, status, timestamps, …). */
export const get = query({
  args: { emailId: v.string() },
  handler: async (ctx, args) => {
    return resendClient().get(ctx, args.emailId as EmailId)
  },
})

/** Cancel a not-yet-sent email (no-op once Resend has sent it). */
export const cancel = mutation({
  args: { emailId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await resendClient().cancelEmail(ctx, args.emailId as EmailId)
    return null
  },
})

/**
 * A mutation that hands one of the provider's prune jobs to the scheduler and
 * returns at once: the provider batches and re-schedules itself until the
 * backlog is gone, so both prunes are safe to call from a cron.
 */
function scheduledCleanup(job: typeof components.resend.lib.cleanupOldEmails) {
  return mutation({
    args: { olderThanMs: v.optional(v.number()) },
    returns: v.null(),
    handler: async (ctx, { olderThanMs }) => {
      await ctx.scheduler.runAfter(0, job, { olderThan: olderThanMs })
      return null
    },
  })
}

/**
 * Prune finalized emails (delivered, bounced, cancelled, failed …) older than
 * `olderThanMs` (the nested provider's default: 7 days) from the provider
 * component's tables. Scheduled rather than run inline — the provider batches
 * and re-schedules itself until the backlog is gone — so this returns at once
 * and is safe to call from a cron. Exposed as `components.backend.email.cleanup`.
 */
export const cleanup = scheduledCleanup(components.resend.lib.cleanupOldEmails)

/**
 * Prune abandoned emails — created more than `olderThanMs` ago (the nested
 * provider's default: 30 days) and never finalized, e.g. because a delivery
 * webhook never arrived. Scheduled like {@link cleanup}. Exposed as
 * `components.backend.email.cleanupAbandoned`.
 */
export const cleanupAbandoned = scheduledCleanup(components.resend.lib.cleanupAbandonedEmails)

/**
 * The event types the nested provider component tracks against sent-email
 * records (delivery status behind `useEmailStatus`). Everything else the
 * provider can send (`contact.*`, `domain.*`, scheduling events) is verified
 * here too and dispatched to the app's typed handlers — just not
 * status-tracked.
 */
const TRACKED_EMAIL_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.complained',
  'email.bounced',
  'email.opened',
  'email.clicked',
  'email.failed',
])

/**
 * Verify and process an email-provider event webhook. The mounting app routes
 * its public `/email/events` endpoint here (via `setupEmail().webhookHandler`),
 * passing the raw body + headers.
 *
 * Fail-closed: no `EMAIL_WEBHOOK_SECRET` → `503` (never silent acceptance);
 * signature invalid across the rotation accept-list (comma-separated secrets)
 * → `403`; verified → the 8 status-tracked `email.*` types update the email's
 * delivery record (making `useEmailStatus()` reactive) and everything answers
 * `202` with the parsed type so the app layer can dispatch its handlers.
 * svix enforces a ±5 minute timestamp tolerance, so stale replays fail
 * verification.
 */
export const handleWebhook = action({
  args: { body: v.string(), headers: v.record(v.string(), v.string()) },
  returns: v.object({ status: v.number(), body: v.string(), type: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const secrets = (env.EMAIL_WEBHOOK_SECRET ?? '')
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
    if (secrets.length === 0) {
      return { status: 503, body: 'Webhook secret not configured' }
    }

    let payload: unknown
    let verified = false
    for (const secret of secrets) {
      try {
        payload = new Webhook(secret).verify(args.body, args.headers)
        verified = true
        break
      }
      catch {
        // Try the next accepted secret (rotation overlap window).
      }
    }
    if (!verified) {
      return { status: 403, body: 'Invalid signature' }
    }

    const type = typeof (payload as { type?: unknown } | null)?.type === 'string'
      ? (payload as { type: string }).type
      : undefined
    if (type && TRACKED_EMAIL_EVENTS.has(type)) {
      // The exact call the provider component's own webhook handler makes
      // after ITS verification — forwarding pre-verified events skips the
      // duplicate check (and its missing-secret throw). Pinned by tests.
      await ctx.runMutation(components.resend.lib.handleEmailEvent, { event: payload })
    }
    return { status: 202, body: '', type }
  },
})
