import { type EmailId, Resend, type SendEmailOptions } from '@convex-dev/resend'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { action, env, mutation, query } from './_generated/server'

/**
 * Email sending, served by the `backend` component itself via the nested Resend
 * component. Consumers get transactional email out of the box: mount `backend`
 * and set `RESEND_API_KEY` — no extra component to install or wire.
 *
 * Configuration comes from the env vars declared on this component in
 * `convex.config.ts` and forwarded by the mounting app. They are read here
 * type-safely via the generated `env`:
 * - `RESEND_API_KEY` — enables delivery (absent ⇒ graceful no-op, logs instead)
 * - `RESEND_FROM` — default From address (falls back to Resend's onboarding sender)
 * - `RESEND_TEST_MODE` — set to `"false"` to deliver to arbitrary recipients
 * - `RESEND_WEBHOOK_SECRET` — verifies delivery/bounce/open webhooks
 */
function resendClient(): Resend {
  return new Resend(components.resend, {
    apiKey: env.RESEND_API_KEY,
    testMode: env.RESEND_TEST_MODE !== 'false',
    webhookSecret: env.RESEND_WEBHOOK_SECRET,
  })
}

const vRecipient = v.union(v.string(), v.array(v.string()))

/**
 * Enqueue a transactional email through the nested Resend component.
 *
 * Exposed as a `public` component function so the parent app (e.g. the auth
 * flows, or `setupEmail`) can call it via `components.backend.email.send`.
 * Component functions are only reachable through the parent — never directly by
 * browser clients.
 */
export const send = mutation({
  args: {
    to: vRecipient,
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    from: v.optional(v.string()),
    cc: v.optional(vRecipient),
    bcc: v.optional(vRecipient),
    replyTo: v.optional(v.array(v.string())),
    headers: v.optional(v.array(v.object({ name: v.string(), value: v.string() }))),
    template: v.optional(v.object({
      id: v.string(),
      variables: v.optional(v.record(v.string(), v.union(v.string(), v.number()))),
    })),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    if (!env.RESEND_API_KEY) {
      console.warn(
        `[nuxt-backend] Email skipped — set RESEND_API_KEY to enable delivery. `
        + `To ${Array.isArray(args.to) ? args.to.join(', ') : args.to}: ${args.subject ?? '(template)'}`,
      )
      return null
    }
    const from = args.from ?? env.RESEND_FROM ?? 'onboarding@resend.dev'
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
 * Process a Resend event webhook. The mounting app routes its public
 * `/resend-webhook` HTTP endpoint here (via `setupEmail().webhookHandler`),
 * passing the raw body + headers; this reconstructs the request, verifies the
 * Svix signature, and updates the email's delivery status — which makes
 * `useEmailStatus()` reactive.
 */
export const handleWebhook = action({
  args: { body: v.string(), headers: v.record(v.string(), v.string()) },
  returns: v.object({ status: v.number(), body: v.string() }),
  handler: async (ctx, args) => {
    const request = new Request('https://convex.local/resend-webhook', {
      method: 'POST',
      body: args.body,
      headers: new Headers(args.headers),
    })
    const resend = resendClient()
    const response = await resend.handleResendEventWebhook(
      ctx as unknown as Parameters<Resend['handleResendEventWebhook']>[0],
      request,
    )
    return { status: response.status, body: await response.text() }
  },
})
