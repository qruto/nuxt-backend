import { PolarCore } from '@polar-sh/sdk/core.js'
import { webhooksRedeliverWebhookEvent } from '@polar-sh/sdk/funcs/webhooksRedeliverWebhookEvent.js'
import { actionGeneric, type FunctionReference, queryGeneric, type RegisteredAction, type RegisteredQuery } from 'convex/server'
import { v } from 'convex/values'
import { Resend } from 'resend'
import { DEFAULT_ADMIN_ROLES } from '../constants.js'
import { backendEnvironment, readEnv, requireProviderAdminEnvironment } from '../delivery.js'
import { billingEnvironment } from '../environment.js'
import { backendError } from '../errors.js'
import { logBackend } from '../log.js'
import { type AdapterFindOne, type Administrators, createAccessReads, isAdministratorNow, requireAdministratorInPerson } from './access.js'
import { type Audit, setupAudit } from './audit.js'
import { providerClientOptions } from './billing/provider-client.js'
import type { WebhookDeliveryRow, WebhookOutcome, WebhookService } from './webhook-guard.js'

export type { WebhookDeliveryRow, WebhookOutcome } from './webhook-guard.js'

// The webhook delivery log, for administrators: the log of both routes
// (`/billing/events`, `/email/events`) and a replay of any delivery
// through the provider's own redelivery, so it arrives signed at the same
// route, verified, deduplicated and logged like the first. The scaffold's
// `backend/webhooks.ts` re-exports both. Each reads the caller's role
// fresh; a replay is an administrator's write: in person, behind a recent
// sign-in, stamped on the delivery (`replayedAt`) and recorded on the
// activity trail (`webhook.replayed`).

/** What a replay answered: the provider took it, and when the delivery was stamped. */
export interface WebhookReplay {
  replayedAt: number
}

/** The functions `backend/webhooks.ts` re-exports. */
export interface WebhooksApi {
  /**
   * The delivery log, newest first: every verified delivery of both
   * providers with its outcome, and a row per kind of request refused
   * before any signature verified (`count`). `null` to anyone but an
   * administrator now, signed out included. `limit` defaults to 50, at
   * most 200.
   */
  getWebhookDeliveries: RegisteredQuery<'public', { limit?: number }, Promise<WebhookDeliveryRow[] | null>>
  /**
   * Ask the delivery's provider to send it again: Polar redelivers the
   * webhook event, Resend replays it. Only a delivery the log holds
   * (verified) can be replayed. An administrator's write: refused as
   * `unauthenticated`, `forbidden` (`impersonating`, `admin_only`) or
   * `reauthentication_required`; `invalid_input` on `deliveryId` for one the
   * log does not hold; `unavailable` when the provider is not set up or
   * refuses.
   */
  replayWebhookDelivery: RegisteredAction<'public', { service: WebhookService, deliveryId: string }, Promise<WebhookReplay>>
}

/** What `setupWebhooks` returns. */
export interface Webhooks {
  /** The functions to re-export from `backend/webhooks.ts`. */
  api: WebhooksApi
}

export interface SetupWebhooksOptions {
  /** The app-wide roles that read the log and replay, read fresh on every call. Default `['admin']`: keep it equal to the admin plugin's. */
  adminRoles?: string[]
  /** The accounts that read the log and replay by id, whatever their role. */
  adminUserIds?: string[]
  /** The app's audit instance, where a replay is recorded; else the component's own trail. */
  audit?: Pick<Audit, 'recordBackendEvent'>
}

/** The `backend` component as the log reads it. */
export interface WebhooksComponents {
  backend: unknown
}

interface WebhookRefs {
  listRecent: FunctionReference<'query', 'internal', { limit?: number }, WebhookDeliveryRow[]>
  entry: FunctionReference<'query', 'internal', { service: string, deliveryId: string }, { type?: string, outcome: WebhookOutcome, receivedAt: number, replayedAt?: number } | null>
  markReplayed: FunctionReference<'mutation', 'internal', { service: string, deliveryId: string }, number | null>
}

/** A provider's refusal of a replay, as the caller reads it. */
function refused(service: WebhookService, detail: string): Error {
  logBackend('warn', 'webhook.replay_refused', `The ${service} provider refused to send a delivery again: ${detail}`)
  return backendError('unavailable', { service, reason: 'provider_refused' }, `[nuxt-backend] The ${service} provider refused to send the delivery again: ${detail}`)
}

/** Polar redelivers a webhook event by its id, the delivery's `webhook-id`. */
async function replayBilling(deliveryId: string): Promise<void> {
  const accessToken = readEnv('BILLING_ACCESS_TOKEN')
  if (!accessToken) throw backendError('unavailable', { service: 'billing', reason: 'not_configured' }, '[nuxt-backend] Replaying a billing delivery needs BILLING_ACCESS_TOKEN on the deployment.')
  const client = new PolarCore(providerClientOptions({ accessToken, environment: billingEnvironment(backendEnvironment()) }))
  const result = await webhooksRedeliverWebhookEvent(client, { id: deliveryId })
  if (!result.ok) throw refused('billing', result.error.message)
}

/**
 * The email provider's webhook this deployment's `/email/events` is: the
 * one whose endpoint is that route on the deployment's own site, else the
 * only one pointing at an `/email/events` route.
 */
async function emailWebhookId(resend: Resend): Promise<string> {
  const { data, error } = await resend.webhooks.list()
  if (error || !data) throw refused('email', error?.message ?? 'no answer listing the webhooks')
  const site = readEnv('CONVEX_SITE_URL')?.replace(/\/+$/, '')
  const routes = data.data.filter(webhook => /\/email\/events\/?$/.test(webhook.endpoint))
  const own = site ? routes.find(webhook => webhook.endpoint.replace(/\/+$/, '') === `${site}/email/events`) : undefined
  const found = own ?? (routes.length === 1 ? routes[0] : undefined)
  if (!found) throw refused('email', 'no webhook of the team points at this deployment\'s /email/events')
  return found.id
}

/** Resend replays a webhook event by its id, the delivery's `svix-id`, on the webhook it went to. */
async function replayEmail(deliveryId: string): Promise<void> {
  const key = readEnv('EMAIL_API_KEY')
  if (!key) throw backendError('unavailable', { service: 'email', reason: 'not_configured' }, '[nuxt-backend] Replaying an email delivery needs EMAIL_API_KEY on the deployment.')
  const resend = new Resend(key)
  const webhookId = await emailWebhookId(resend)
  const { error } = await resend.webhooks.events.replay({ webhookId, eventId: deliveryId })
  if (error) throw refused('email', error.message)
}

/** The provider call a replay makes, by service. */
const REPLAYERS: Record<WebhookService, (deliveryId: string) => Promise<void>> = { billing: replayBilling, email: replayEmail }

/**
 * The webhook delivery log and its replay, for administrators: the two
 * functions `backend/webhooks.ts` re-exports, behind the admin console's
 * Webhooks tab and DevTools' webhook feed.
 *
 * @example
 * ```ts [backend/webhooks.ts]
 * import { setupWebhooks } from 'nuxt-backend/admin'
 * import { components } from './_generated/api'
 *
 * export const webhooks = setupWebhooks(components)
 *
 * export const { getWebhookDeliveries, replayWebhookDelivery } = webhooks.api
 * ```
 */
export function setupWebhooks(components: WebhooksComponents, options: SetupWebhooksOptions = {}): Webhooks {
  const backend = components.backend as { webhooks: WebhookRefs, adapter?: { findOne: AdapterFindOne }, audit?: unknown }
  const refs = backend.webhooks
  const reads = backend.adapter ? createAccessReads(backend.adapter.findOne) : null
  const administrators: Administrators = { roles: options.adminRoles ?? DEFAULT_ADMIN_ROLES, userIds: options.adminUserIds ?? [] }
  const trail = options.audit ?? (backend.audit && backend.adapter ? setupAudit(components as never) : undefined)

  const getWebhookDeliveries = queryGeneric({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, { limit }): Promise<WebhookDeliveryRow[] | null> => {
      if (!reads || !await isAdministratorNow(ctx, reads, administrators, 'getWebhookDeliveries')) return null
      return ctx.runQuery(refs.listRecent, { limit })
    },
  })

  const replayWebhookDelivery = actionGeneric({
    args: { service: v.union(v.literal('billing'), v.literal('email')), deliveryId: v.string() },
    handler: async (ctx, { service, deliveryId }): Promise<WebhookReplay> => {
      if (!reads) throw backendError('forbidden', { reason: 'admin_only' }, '[nuxt-backend] replayWebhookDelivery is for administrators, and the backend component has no auth adapter to read them.')
      await requireAdministratorInPerson(ctx, reads, administrators, 'replayWebhookDelivery')
      // A public sandbox (the playground) lets anyone be an administrator: a replay there reaches the provider for real.
      requireProviderAdminEnvironment('replayWebhookDelivery', 'a replay asks the provider to send a delivery again')
      const entry = await ctx.runQuery(refs.entry, { service, deliveryId })
      if (!entry) throw backendError('invalid_input', { field: 'deliveryId' }, '[nuxt-backend] replayWebhookDelivery: the log holds no verified delivery with this id.')
      await REPLAYERS[service](deliveryId)
      const replayedAt = await ctx.runMutation(refs.markReplayed, { service, deliveryId }) ?? Date.now()
      if (trail) {
        await trail.recordBackendEvent(ctx as never, { type: 'webhook.replayed', data: { service, delivery: deliveryId, ...(entry.type ? { type: entry.type } : {}) } } as never)
      }
      return { replayedAt }
    },
  })

  return { api: { getWebhookDeliveries, replayWebhookDelivery } as WebhooksApi }
}
