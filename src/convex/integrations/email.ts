import {
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  queryGeneric,
} from 'convex/server'
import { v } from 'convex/values'
import { Resend } from 'resend'
import { guardDelivery, parseSecretList, WEBHOOK_BODY_LIMIT, type WebhookLogRefs } from './webhook-guard'

/**
 * The component handle `setupEmail` reads from your generated `components`
 * object: the package's all-in-one `backend` component, whose email functions
 * the app reaches as `components.backend.email.*` (see
 * `src/convex/components/backend/email.ts`). Pass the whole `components`
 * object — the key is picked structurally.
 */
export interface EmailComponents {
  backend: {
    email: {
      // Component functions always surface to the parent app as `internal`
      // references in the generated `ComponentApi`, regardless of how they
      // are registered inside the component.
      send: FunctionReference<'mutation', 'internal', SendEmailOptions, string | null>
      status: FunctionReference<'query', 'internal', { emailId: string }, EmailStatus | null>
      get: FunctionReference<'query', 'internal', { emailId: string }, unknown>
      cancel: FunctionReference<'mutation', 'internal', { emailId: string }, null>
      handleWebhook: FunctionReference<'action', 'internal', { body: string, headers: Record<string, string> }, { status: number, body: string, type?: string }>
    }
    webhooks?: WebhookLogRefs
  }
}

/** Resend delivery status, as returned by the component `status` query. */
export interface EmailStatus {
  status: string
  errorMessage: string | null
  bounced: boolean
  complained: boolean
  failed: boolean
  deliveryDelayed: boolean
  opened: boolean
  clicked: boolean
}

/** Options for a transactional send (mirrors the component `send` mutation). */
export type SendEmailOptions = {
  to: string | string[]
  subject?: string
  html?: string
  text?: string
  from?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string[]
  headers?: Array<{ name: string, value: string }>
  template?: { id: string, variables?: Record<string, string | number> }
}

/**
 * A minimal action context (just the `run*` callers) — DataModel-independent so
 * any app action / httpAction ctx is assignable regardless of its schema.
 */
type AnyActionCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation' | 'runAction'>

/**
 * The provider's full webhook event catalog: every transactional delivery
 * state, plus the contact and domain events the marketing surface
 * (audiences/contacts/broadcasts) generates. Broadcast sends surface as
 * `email.*` events carrying a `broadcast_id`.
 */
export const ALL_EMAIL_EVENTS = [
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
  'email.suppressed',
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'domain.created',
  'domain.updated',
  'domain.deleted',
] as const

export type EmailWebhookEventType = (typeof ALL_EMAIL_EVENTS)[number]

/** `email.*` payload data (documented fields + open for provider additions). */
export interface EmailEventData {
  email_id?: string
  from?: string
  to?: string[]
  subject?: string
  created_at?: string
  broadcast_id?: string
  bounce?: { type?: string, subType?: string, message?: string }
  [key: string]: unknown
}

/** `contact.*` payload data. */
export interface ContactEventData {
  id?: string
  audience_id?: string
  email?: string
  first_name?: string
  last_name?: string
  unsubscribed?: boolean
  [key: string]: unknown
}

/** `domain.*` payload data. */
export interface DomainEventData {
  id?: string
  name?: string
  status?: string
  [key: string]: unknown
}

type EventDataFor<T extends EmailWebhookEventType>
  = T extends `email.${string}` ? EmailEventData
    : T extends `contact.${string}` ? ContactEventData
      : DomainEventData

/** A verified provider webhook event, as delivered to the typed handlers. */
export interface EmailWebhookEvent<T extends EmailWebhookEventType = EmailWebhookEventType> {
  type: T
  created_at?: string
  data: EventDataFor<T>
}

/**
 * Per-event email webhook handlers, keyed by the provider's event names —
 * the complete catalog, uniform with `setupBilling({ events })`.
 */
export type EmailWebhookEventHandlers = {
  [K in EmailWebhookEventType]?: (ctx: AnyActionCtx, event: EmailWebhookEvent<K>) => Promise<void>
}

export interface SetupEmailOptions {
  /**
   * React to any verified provider event, keyed by its event name
   * (`'email.bounced'`, `'contact.created'`, …). Handlers run **after** the
   * component has verified the signature and updated delivery status —
   * `useEmailStatus` already reflects the event. A handler throw answers 500,
   * so the provider redelivers (deliveries are deduped once fully processed).
   */
  events?: EmailWebhookEventHandlers
  /**
   * Called for a **verified** event whose type is outside the known catalog
   * (a provider newer than this package). Acknowledged 202 either way.
   */
  onUnknownEvent?: (ctx: AnyActionCtx, event: { type?: string, payload: unknown }) => Promise<void>
  /**
   * Record inbound webhook deliveries in the component's capped ring buffer
   * (dedupe + doctor + DevTools feed). `false` disables the log and dedupe.
   */
  deliveryLog?: boolean
}

const sendArgs = {
  to: v.union(v.string(), v.array(v.string())),
  subject: v.optional(v.string()),
  html: v.optional(v.string()),
  text: v.optional(v.string()),
  from: v.optional(v.string()),
  cc: v.optional(v.union(v.string(), v.array(v.string()))),
  bcc: v.optional(v.union(v.string(), v.array(v.string()))),
  replyTo: v.optional(v.array(v.string())),
  headers: v.optional(v.array(v.object({ name: v.string(), value: v.string() }))),
  template: v.optional(v.object({
    id: v.string(),
    variables: v.optional(v.record(v.string(), v.union(v.string(), v.number()))),
  })),
}

async function unwrap<T>(promise: Promise<{ data: T | null, error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw new Error(`[nuxt-backend] Resend: ${error.message}`)
  return data as T
}

type ResendSdk = Resend
function marketingClient(): ResendSdk {
  return new Resend(process.env.EMAIL_API_KEY)
}

export interface Email {
  /**
   * Ready-made, client-callable functions to re-export from your `backend/email.ts`.
   * Currently `getEmailStatus` (the reactive query behind `useEmailStatus`).
   */
  api: {
    getEmailStatus: ReturnType<typeof queryGeneric>
  }
  /** Send a transactional email (call from your own gated action/mutation). */
  send: (ctx: AnyActionCtx, options: SendEmailOptions) => Promise<string | null>
  /** Read an email's delivery status. */
  status: (ctx: AnyActionCtx, emailId: string) => Promise<EmailStatus | null>
  /** Cancel a not-yet-sent email. */
  cancel: (ctx: AnyActionCtx, emailId: string) => Promise<void>
  /**
   * Handle an email-provider event webhook from your app's `/email/events`
   * HTTP route (inside an `httpAction`); returns the Response to send back.
   */
  webhookHandler: (ctx: AnyActionCtx, request: Request) => Promise<Response>
  /** Marketing audiences (Resend segments): create / list / remove. */
  audiences: {
    create: (payload: Parameters<ResendSdk['audiences']['create']>[0]) => Promise<unknown>
    list: () => Promise<unknown>
    remove: (id: string) => Promise<unknown>
  }
  /** Marketing contacts: add (subscribe) / list / update / remove (unsubscribe). */
  contacts: {
    add: (payload: Parameters<ResendSdk['contacts']['create']>[0]) => Promise<unknown>
    list: (payload: Parameters<ResendSdk['contacts']['list']>[0]) => Promise<unknown>
    update: (payload: Parameters<ResendSdk['contacts']['update']>[0]) => Promise<unknown>
    remove: (payload: Parameters<ResendSdk['contacts']['remove']>[0]) => Promise<unknown>
  }
  /** Marketing broadcasts: create / send (optionally scheduled). */
  broadcasts: {
    create: (payload: Parameters<ResendSdk['broadcasts']['create']>[0]) => Promise<unknown>
    send: (id: string, payload?: Parameters<ResendSdk['broadcasts']['send']>[1]) => Promise<unknown>
  }
}

/**
 * App-facing email helper over the `backend` component's email module: both
 * **transactional** email (send / status / cancel + webhook) and **marketing**
 * email (audiences / contacts / broadcasts via the provider SDK).
 *
 * Both use the required `EMAIL_API_KEY` env var. While it's missing (e.g. a
 * mid-configuration preview), transactional `send` logs instead of delivering.
 *
 * @example
 * ```ts
 * import { setupEmail } from 'nuxt-backend/email'
 * import { components } from './_generated/api'
 *
 * export const email = setupEmail(components)
 * export const { getEmailStatus } = email.api
 * ```
 */
export function setupEmail(components: EmailComponents, options: SetupEmailOptions = {}): Email {
  const refs = components.backend.email
  const events = options.events

  const send: Email['send'] = (ctx, options) =>
    ctx.runMutation(refs.send, options)

  const status: Email['status'] = (ctx, emailId) =>
    ctx.runQuery(refs.status, { emailId })

  const cancel: Email['cancel'] = async (ctx, emailId) => {
    await ctx.runMutation(refs.cancel, { emailId })
  }

  const webhookHandler: Email['webhookHandler'] = async (ctx, request) => {
    const body = await request.text()
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    // Shared fail-closed edge (size cap, dedupe, delivery logging). The secret
    // itself lives on the component env; the app-declared copy of the same
    // deployment var answers "configured?" without invoking the component.
    const logRefs = options.deliveryLog === false ? undefined : components.backend.webhooks
    const secretsConfigured = parseSecretList(readProcessEnv('EMAIL_WEBHOOK_SECRET')).length > 0
    const guard = logRefs
      ? await guardDelivery(ctx as never, logRefs, {
          service: 'email',
          deliveryId: headers['svix-id'] ?? null,
          bodyLength: body.length,
          secretsConfigured,
        })
      : {
          rejection: !secretsConfigured
            ? new Response('Webhook secret not configured', { status: 503 })
            : body.length > WEBHOOK_BODY_LIMIT ? new Response('Payload too large', { status: 413 }) : null,
          record: async () => {},
        }
    if (guard.rejection) return guard.rejection

    const result = await ctx.runAction(refs.handleWebhook, { body, headers })
    if (result.status === 403) {
      await guard.record('invalid_signature')
      return new Response(result.body || null, { status: 403 })
    }
    if (result.status >= 300) {
      await guard.record('handler_error', { note: `component answered ${result.status}` })
      return new Response(result.body || null, { status: result.status })
    }

    // Verified. Dispatch the typed handler (or the unknown-type hook) — a
    // handler throw propagates to a 500 so the provider redelivers against
    // the idempotent built-ins.
    const type = result.type
    const known = type !== undefined && (ALL_EMAIL_EVENTS as readonly string[]).includes(type)
    try {
      if (known) {
        const handler = events?.[type as EmailWebhookEventType]
        if (handler) {
          const payload = JSON.parse(body) as EmailWebhookEvent
          await (handler as (ctx: AnyActionCtx, event: EmailWebhookEvent) => Promise<void>)(ctx, payload)
        }
        await guard.record('ok', { type })
      }
      else {
        if (options.onUnknownEvent) {
          await options.onUnknownEvent(ctx, { type, payload: safeParse(body) })
        }
        await guard.record('unknown_type', { type })
        return new Response('Accepted (unknown event type)', { status: 202 })
      }
    }
    catch (error) {
      await guard.record('handler_error', {
        type,
        note: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    return new Response(result.body || null, { status: result.status })
  }

  const getEmailStatus = queryGeneric({
    args: { emailId: v.string() },
    // Delivery records carry recipient/error detail, so require a signed-in
    // caller — email ids leak via `send` return values, logs, and referrers,
    // and this is otherwise an unauthenticated lookup by opaque id.
    handler: async (ctx, args) => {
      if (!(await ctx.auth.getUserIdentity())) return null
      return ctx.runQuery(refs.status, { emailId: args.emailId })
    },
  })

  return {
    api: { getEmailStatus },
    send,
    status,
    cancel,
    webhookHandler,
    audiences: {
      create: payload => unwrap(marketingClient().audiences.create(payload)),
      list: () => unwrap(marketingClient().audiences.list()),
      remove: id => unwrap(marketingClient().audiences.remove(id)),
    },
    contacts: {
      add: payload => unwrap(marketingClient().contacts.create(payload)),
      list: payload => unwrap(marketingClient().contacts.list(payload)),
      update: payload => unwrap(marketingClient().contacts.update(payload)),
      remove: payload => unwrap(marketingClient().contacts.remove(payload)),
    },
    broadcasts: {
      create: payload => unwrap(marketingClient().broadcasts.create(payload)),
      send: (id, payload) => unwrap(marketingClient().broadcasts.send(id, payload)),
    },
  }
}

function safeParse(body: string): unknown {
  try {
    return JSON.parse(body)
  }
  catch {
    return body
  }
}

function readProcessEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}

/** Re-export so consumers can keep the `send` argument validator aligned. */
export { sendArgs }
