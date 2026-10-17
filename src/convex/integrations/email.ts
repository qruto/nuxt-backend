import {
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  queryGeneric,
} from 'convex/server'
import { v } from 'convex/values'
import { Resend, type CreateContactOptions } from 'resend'
import { handleWebhookDelivery, parseSecretList, type WebhookLogRefs } from './webhook-guard.js'
import {
  emailRenderContext,
  escapeHtml,
  type EmailMessage,
  type EmailRenderContext,
  type EmailTemplateData,
  type EmailTemplateName,
  type EmailTemplateOverrides,
  resolveEmailTemplates,
} from '../email-templates.js'
import { backendError } from '../errors.js'

export type {
  DeleteAccountEmailData,
  EmailBrand,
  EmailChangedEmailData,
  EmailMessage,
  EmailRenderContext,
  EmailTemplateData,
  EmailTemplateName,
  EmailTemplateOverrides,
  EmailTemplates,
  GiftEmailData,
  InviteEmailData,
  OtpEmailData,
  OtpPurpose,
  WelcomeEmailData,
} from '../email-templates.js'
export type { LabelParams, Translate } from '../labels.js'

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
      get: FunctionReference<'query', 'internal', { emailId: string }, EmailRecord | null>
      cancel: FunctionReference<'mutation', 'internal', { emailId: string }, null>
      /** Retention pruning of the provider component's email records. */
      cleanup: FunctionReference<'mutation', 'internal', { olderThanMs?: number }, null>
      cleanupAbandoned: FunctionReference<'mutation', 'internal', { olderThanMs?: number }, null>
      handleWebhook: FunctionReference<'action', 'internal', { body: string, headers: Record<string, string> }, { status: number, body: string, type?: string }>
      /** The sandbox inbox (test mode only). */
      inbox: FunctionReference<'query', 'internal', { address: string }, SandboxMessage[]>
    }
    webhooks: WebhookLogRefs
  }
}

/**
 * A message in a sandbox inbox: what test mode sent to one of the provider's
 * sandbox addresses (`delivered+label@resend.dev`) within the last hour.
 * Part of the experimental sandbox inbox (`useSandboxInbox`, STABILITY.md).
 */
export interface SandboxMessage {
  from: string
  subject: string
  text?: string
  html?: string
  /** When it was sent, as epoch ms. */
  receivedAt: number
}

/** A sent email's delivery state, as the component `status` query returns it. */
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

/** A sent email's record, as the component `get` query returns it. */
export interface EmailRecord extends EmailStatus {
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  replyTo: string[]
  html?: string
  text?: string
  template?: { id: string, variables?: Record<string, string | number> }
  headers?: Array<{ name: string, value: string }>
  /** When it was queued, as epoch ms. */
  createdAt: number
  /**
   * When it reached a final state (delivered, bounced, failed, cancelled), as
   * epoch ms — a far-future sentinel while it is still in flight.
   */
  finalizedAt: number
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
  /**
   * Dedupes the send: a second send with the same key, while the first is
   * still on record, returns the first one's id and delivers nothing.
   */
  idempotencyKey?: string
}

/**
 * A minimal action context (just the `run*` callers) — DataModel-independent so
 * any app action / httpAction ctx is assignable regardless of its schema.
 */
type AnyActionCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation' | 'runAction'>
/** A mutation's or an action's ctx — what sending, cancelling and pruning need. */
type RunMutationCtx = Pick<GenericActionCtx<GenericDataModel>, 'runMutation'>
/** Any function's ctx — what reading a status needs. */
type RunQueryCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>

/**
 * The provider's full webhook event catalog: every transactional delivery
 * state, plus the contact and domain events the marketing surface
 * (segments/contacts/broadcasts) generates. Broadcast sends surface as
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
  /** The segments the contact belongs to. */
  segment_ids?: string[]
  /** @deprecated The provider still sends it; read `segment_ids`. */
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
   * Restyle any email the package sends, by template name: `otp`,
   * `welcome`, `deleteAccount`, `invite`, `gift`. Each override gets the
   * template's data and its render context, the default included:
   * `invite: (data, { byDefault }) => ({ ...byDefault(data), subject: 'Join us' })`.
   */
  templates?: EmailTemplateOverrides
  /**
   * The app the emails are sent for. `name` reaches every template as
   * `brand.name`; without it, the brand is the host of `SITE_URL`. The
   * packaged emails sign off with it, linked to `SITE_URL`.
   */
  brand?: { name?: string }
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
}

/**
 * The provider's answer, or `unavailable` (reason `provider_refused`): the
 * provider's own words stay in the error's message, for the log, and never
 * reach a client in production.
 */
async function unwrap<T>(promise: Promise<{ data: T | null, error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw backendError('unavailable', { service: 'email', reason: 'provider_refused' }, `[nuxt-backend] Resend: ${error.message}`)
  return data as T
}

type ResendSdk = Resend
function marketingClient(): ResendSdk {
  return new Resend(process.env.EMAIL_API_KEY)
}

export interface Email {
  /**
   * Ready-made, client-callable functions to re-export from your `backend/email.ts`:
   * `getEmailStatus` (the reactive query behind `useEmailStatus`) and
   * `getSandboxInbox` (behind `useSandboxInbox`).
   */
  api: {
    getEmailStatus: ReturnType<typeof queryGeneric>
    /**
     * The messages test mode sent to a sandbox address within the last hour,
     * newest first — for a demo, a preview deployment or an e2e run that has
     * to read a sign-in code without a real mailbox. Public and unauthenticated
     * by design (the visitor is not signed in yet), so knowing an address is
     * enough to read its mail: re-export it only where every account is a
     * throwaway sandbox one. Empty for any other address, and always empty
     * with `EMAIL_TEST_MODE=false`, which captures nothing. Experimental,
     * with `useSandboxInbox` (STABILITY.md).
     */
    getSandboxInbox: ReturnType<typeof queryGeneric>
  }
  /** Send a transactional email (call from your own gated action/mutation). */
  send: (ctx: RunMutationCtx, options: SendEmailOptions) => Promise<string | null>
  /**
   * Render one of the package's emails, your override or the packaged
   * default, without sending it: what a preview page or a test shows.
   * Resolves once an async override has rendered.
   */
  render: <Name extends EmailTemplateName>(name: Name, data: EmailTemplateData<Name>, options?: { locale?: string }) => Promise<EmailMessage>
  /** Render one of the package's emails and send it. */
  sendTemplate: <Name extends EmailTemplateName>(
    ctx: RunMutationCtx,
    name: Name,
    data: EmailTemplateData<Name>,
    options?: { locale?: string, idempotencyKey?: string },
  ) => Promise<string | null>
  /** Read an email's delivery status. */
  status: (ctx: RunQueryCtx, emailId: string) => Promise<EmailStatus | null>
  /** Cancel a not-yet-sent email. */
  cancel: (ctx: RunMutationCtx, emailId: string) => Promise<void>
  /**
   * Prune finalized email records (delivered, bounced, cancelled, failed …)
   * older than `olderThanMs` — default 7 days. Schedules the provider's
   * batched cleanup and returns at once; call it from a cron.
   *
   * @example
   * ```ts [backend/crons.ts]
   * crons.daily('prune emails', { hourUTC: 3, minuteUTC: 0 }, internal.email.pruneEmails)
   * // internal.email.pruneEmails: internalMutation(ctx => email.cleanup(ctx, { olderThanMs: 7 * DAY }))
   * ```
   */
  cleanup: (ctx: RunMutationCtx, options?: { olderThanMs?: number }) => Promise<void>
  /**
   * Prune abandoned email records — created more than `olderThanMs` ago
   * (default 30 days) and never finalized, e.g. because a delivery webhook
   * never arrived. Scheduled like `cleanup`.
   */
  cleanupAbandoned: (ctx: RunMutationCtx, options?: { olderThanMs?: number }) => Promise<void>
  /**
   * Handle an email-provider event webhook from your app's `/email/events`
   * HTTP route (inside an `httpAction`); returns the Response to send back.
   */
  webhookHandler: (ctx: AnyActionCtx, request: Request) => Promise<Response>
  /**
   * Marketing segments — the groups a broadcast is sent to. A contact is one
   * record however many segments it sits in: put it in one at creation
   * (`contacts.add({ email, segments: [{ id }] })`) or later with `addContact`.
   */
  segments: {
    create: (payload: Parameters<ResendSdk['segments']['create']>[0]) => Promise<unknown>
    list: () => Promise<unknown>
    remove: (id: string) => Promise<unknown>
    /** Put an existing contact (`contactId` or `email`) in a segment. */
    addContact: (payload: Parameters<ResendSdk['contacts']['segments']['add']>[0]) => Promise<unknown>
    /** Take a contact out of a segment; the contact itself stays. */
    removeContact: (payload: Parameters<ResendSdk['contacts']['segments']['remove']>[0]) => Promise<unknown>
  }
  /** Marketing contacts: add (subscribe) / list / update / remove (unsubscribe). */
  contacts: {
    add: (payload: CreateContactOptions) => Promise<unknown>
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
 * email (segments / contacts / broadcasts via the provider SDK). It also
 * holds the templates of every email the package sends: `setupAuth` and
 * `setupBilling` take this instance as their `email` option and send through
 * it, so an override here restyles all of them.
 *
 * Both use the required `EMAIL_API_KEY` env var. While it's missing (e.g. a
 * mid-configuration preview), transactional `send` logs instead of delivering.
 *
 * @example
 * ```ts
 * import { setupEmail } from 'nuxt-backend/email'
 * import { components } from './_generated/api'
 *
 * export const email = setupEmail(components, {
 *   templates: { invite: (data, { byDefault }) => ({ ...byDefault(data), subject: 'Join the team' }) },
 * })
 * export const { getEmailStatus } = email.api
 * ```
 */
export function setupEmail(components: EmailComponents, options: SetupEmailOptions = {}): Email {
  const refs = components.backend.email
  const events = options.events
  const templates = resolveEmailTemplates(options.templates)

  const send: Email['send'] = (ctx, options) =>
    ctx.runMutation(refs.send, options)

  const render: Email['render'] = async (name, data, renderOptions = {}) => {
    const context = emailRenderContext({ siteUrl: readProcessEnv('SITE_URL') ?? '', brandName: options.brand?.name, locale: renderOptions.locale })
    return await (templates[name] as (data: unknown, context: EmailRenderContext) => EmailMessage | Promise<EmailMessage>)(data, context)
  }

  const sendTemplate: Email['sendTemplate'] = async (ctx, name, data, { locale, idempotencyKey } = {}) =>
    send(ctx, { ...(await render(name, data, { locale })), ...(idempotencyKey ? { idempotencyKey } : {}) })

  const status: Email['status'] = (ctx, emailId) =>
    ctx.runQuery(refs.status, { emailId })

  const cancel: Email['cancel'] = async (ctx, emailId) => {
    await ctx.runMutation(refs.cancel, { emailId })
  }

  const cleanup: Email['cleanup'] = async (ctx, options = {}) => {
    await ctx.runMutation(refs.cleanup, options)
  }

  const cleanupAbandoned: Email['cleanupAbandoned'] = async (ctx, options = {}) => {
    await ctx.runMutation(refs.cleanupAbandoned, options)
  }

  const webhookHandler: Email['webhookHandler'] = async (ctx, request) => {
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    // The secret itself lives on the component env; the app-declared copy of
    // the same deployment var answers "configured?" without invoking the
    // component.
    return handleWebhookDelivery(ctx, components.backend.webhooks, {
      service: 'email',
      deliveryId: headers['svix-id'] ?? null,
      request,
      secretsConfigured: parseSecretList(readProcessEnv('EMAIL_WEBHOOK_SECRET')).length > 0,
      onUnknownEvent: options.onUnknownEvent,
      verify: async (event, body) => {
        let result: { status: number, body: string, type?: string }
        try {
          result = await ctx.runAction(refs.handleWebhook, { body, headers })
        }
        catch (error) {
          // Nothing is verified yet, so the type in the body is the sender's
          // word: a verdict, not a throw, keeps it out of the delivery log.
          // Still a 500, so the provider retries.
          return { outcome: 'handler_error', note: `the signature check failed to run: ${error instanceof Error ? error.message : String(error)}` }
        }
        if (result.status === 403) return { outcome: 'invalid_signature', response: new Response(result.body || null, { status: 403 }) }
        // The component holds no secret although the app does: `app.use(backend,
        // { env })` does not forward EMAIL_WEBHOOK_SECRET. Nothing was verified,
        // so the request is counted like any other refused before a signature.
        if (result.status === 503) {
          return { outcome: 'missing_secret', note: 'the backend component has no EMAIL_WEBHOOK_SECRET', response: new Response(result.body || null, { status: 503 }) }
        }
        if (result.status >= 300) {
          return { outcome: 'handler_error', note: `component answered ${result.status}`, response: new Response(result.body || null, { status: result.status }) }
        }
        // Verified. Dispatch the typed handler; a throw propagates to a 500 so
        // the provider redelivers against the idempotent built-ins.
        const type = result.type
        if (type === undefined || !(ALL_EMAIL_EVENTS as readonly string[]).includes(type)) return { outcome: 'unknown_type', type }
        const handler = events?.[type as EmailWebhookEventType]
        if (handler) await (handler as (ctx: AnyActionCtx, event: EmailWebhookEvent) => Promise<void>)(ctx, event.payload as EmailWebhookEvent)
        return { outcome: 'ok', type, response: new Response(result.body || null, { status: result.status }) }
      },
    })
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

  const getSandboxInbox = queryGeneric({
    args: { address: v.string() },
    handler: async (ctx, args): Promise<SandboxMessage[]> => {
      return ctx.runQuery(refs.inbox, { address: args.address })
    },
  })

  return {
    api: { getEmailStatus, getSandboxInbox },
    send,
    render,
    sendTemplate,
    status,
    cancel,
    cleanup,
    cleanupAbandoned,
    webhookHandler,
    segments: {
      create: payload => unwrap(marketingClient().segments.create(payload)),
      list: () => unwrap(marketingClient().segments.list()),
      remove: id => unwrap(marketingClient().segments.remove(id)),
      addContact: payload => unwrap(marketingClient().contacts.segments.add(payload)),
      removeContact: payload => unwrap(marketingClient().contacts.segments.remove(payload)),
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

function readProcessEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}

export { escapeHtml }
