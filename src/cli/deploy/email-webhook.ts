import { Resend } from 'resend'

// The email provider's webhook at a deployment's `/email/events`, as
// `nuxt-backend deploy` registers it: found by its endpoint before one is
// created, so a second run creates nothing. The signing secret comes back
// in memory only, for the caller to store on the deployment.

type WebhookEvent = Parameters<Resend['webhooks']['create']>[0]['events'][number]

/**
 * Every event the provider sends, the same catalog the backend's webhook
 * route accepts (`ALL_EMAIL_EVENTS`, src/convex/integrations/email.ts; a
 * test holds the two equal).
 */
export const EMAIL_WEBHOOK_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.opened',
  'email.clicked',
  'email.failed',
  'email.scheduled',
  'email.received',
  'inbox.email.received',
  'email.suppressed',
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'contact.topics.updated',
  'domain.created',
  'domain.updated',
  'domain.deleted',
  'suppression.added',
  'suppression.removed',
  'topic.created',
  'topic.updated',
  'topic.deleted',
] as const satisfies readonly WebhookEvent[]

/** What registering the webhook did. The secret is never printed: the caller stores it and drops it. */
export interface EmailWebhookResult {
  action: 'created' | 'exists' | 'would-create'
  /** The endpoint's signing secret, when one was created or read. */
  secret?: string
}

/** The provider calls the step makes, injectable for tests. */
export type EmailWebhookClient = Pick<Resend['webhooks'], 'list' | 'get' | 'create'>

/** A provider error as one line, without the key. */
function providerError(step: string, error: { message?: string } | null): Error {
  return new Error(`${step} failed${error?.message ? `: ${error.message}` : ''}`)
}

/**
 * Find the provider's webhook at `url`, or create one subscribed to every
 * event; on a dry run, only look. Resolves with its signing secret, which the
 * provider returns on every read of one webhook.
 */
export async function ensureEmailWebhook(apiKey: string, url: string, { dryRun = false, client }: { dryRun?: boolean, client?: EmailWebhookClient } = {}): Promise<EmailWebhookResult> {
  const webhooks = client ?? new Resend(apiKey).webhooks
  const listed = await webhooks.list()
  if (listed.error || !listed.data) throw providerError('Listing the email webhooks', listed.error)
  const existing = listed.data.data.find(webhook => webhook.endpoint.replace(/\/+$/, '') === url)
  if (existing) {
    if (dryRun) return { action: 'exists' }
    const read = await webhooks.get(existing.id)
    if (read.error || !read.data) throw providerError('Reading the email webhook', read.error)
    return { action: 'exists', secret: read.data.signing_secret }
  }
  if (dryRun) return { action: 'would-create' }
  const created = await webhooks.create({ endpoint: url, events: [...EMAIL_WEBHOOK_EVENTS] })
  if (created.error || !created.data) throw providerError('Creating the email webhook', created.error)
  return { action: 'created', secret: created.data.signing_secret }
}
