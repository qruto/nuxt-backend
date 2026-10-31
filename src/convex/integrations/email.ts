import {
  actionGeneric,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  queryGeneric,
} from 'convex/server'
import { v } from 'convex/values'
import { Resend, type CreateContactOptions } from 'resend'
import { deliveryIdOf } from '../webhook-signatures.js'
import { handleWebhookDelivery, parseSecretList, type WebhookLogRefs } from './webhook-guard.js'
import {
  createEmailRenderer,
  escapeHtml,
  html,
  recipientOf,
  trustedHtml,
  type EmailBrand,
  type EmailLocalePaths,
  type EmailMessage,
  type EmailMessages,
  type EmailPreview,
  type EmailRenderContext,
  type EmailTemplateData,
  type EmailTemplateName,
  type EmailTemplateOverrides,
  type EmailTheme,
} from '../email-templates.js'
import { backendEnvironment, isSandboxAddress, readEnv } from '../delivery.js'
import { publishesDevInbox } from '../environment.js'
import { forceColorScheme } from '../email-scheme.js'
import { backendError } from '../errors.js'
import { normalizeLocale } from '../locale.js'
import { logBackend } from '../log.js'
import { normalizeEmail } from '../tokens.js'
import { type Audit, type AuditCtx, setupAudit } from './audit.js'
import { createEmailPreferences, type EmailPreferences, type EmailPreferencesApi } from './email-preferences.js'
import { type AnnouncementsApi, createAnnouncements } from './announcements.js'
import { createSuppressions, followSuppressionEvent, type SuppressionRefs, type SuppressionsApi } from './email-suppressions.js'
import { DEFAULT_ADMIN_ROLES } from '../constants.js'
import { isAdministrator } from './access.js'
import { type EmailContactProperty, syncEmailAction } from './email-sync.js'
import { createLifecycle, type EmailAutomations, type EmailLifecycle, type EmailLifecycleRunner, flowEmail, lifecycleProblem, lifecycleSettings } from './email-lifecycle.js'
import { PROVIDER_UNSUBSCRIBE_URL } from './announcements.js'
import { resolveCaps } from '../email-preferences.js'
import type { LifecycleFlow } from '../lifecycle-flows.js'
import { capsProblem, type EmailCaps, type EmailTopics, topicsProblem } from '../email-preferences.js'
import { type ContactOptions, createInbound, type InboundOptions, type InboundRateLimiter } from './inbound.js'
import { type BackendPaths, resolveBackendPaths } from '../paths.js'

export type {
  EmailBlock,
  DeletionCanceledEmailData,
  DeletionScheduledEmailData,
  EmailBrand,
  EmailChangedEmailData,
  EmailColors,
  EmailFonts,
  EmailLocalePaths,
  EmailMessage,
  EmailMessages,
  EmailPreview,
  EmailRenderContext,
  EmailScheme,
  EmailTemplateData,
  EmailTemplateName,
  EmailTemplateOverrides,
  EmailTemplates,
  EmailTheme,
  GiftEmailData,
  GiftPassEndingEmailData,
  RenewalReminderEmailData,
  WithdrawalReceiptEmailData,
  InviteEmailData,
  OtpEmailData,
  OtpPurpose,
  ResolvedEmailTheme,
  PasskeyRecoveredEmailData,
  NewDeviceEmailData,
  RequestOrigin,
  TopicConfirmationEmailData,
  TrustedHtml,
  WaitlistAdmittedEmailData,
  WaitlistConfirmationEmailData,
  WelcomeEmailData,
  NoticeReceivedEmailData,
  NoticeDecidedEmailData,
  ContentRestrictedEmailData,
  AppealDecidedEmailData,
} from '../email-templates.js'
export type { LabelParams, Translate } from '../labels.js'
export type { ClockTime, EmailCaps, EmailTopic, EmailTopics, TopicSource, TopicState } from '../email-preferences.js'
export type { EmailLinkView, EmailPreferencesApi, EmailTopicPreference } from './email-preferences.js'
export type { EmailContactProperty, EmailSyncAction, EmailSyncLogEntry, EmailSyncReport } from './email-sync.js'
export type { EmailAutomations, EmailLifecycle, EmailRunCtx, LifecycleFlow, LifecycleFlowOptions, LifecycleKind } from './email-lifecycle.js'
export type { Suppression, SuppressionOrigin, SuppressionsApi, SuppressionsPage } from './email-suppressions.js'
export type { AnnouncementAudience, AnnouncementBroadcastState, AnnouncementRow, AnnouncementsApi, AnnouncementsConsole, LiveAnnouncement, PublishAnnouncementInput } from './announcements.js'
export type { ContactOptions, InboundMessage, InboundOptions, InboundRateLimiter, InboundSyncReport, InboxConsole, InboxRow } from './inbound.js'

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
      send: FunctionReference<'mutation', 'internal', SendEmailOptions & { retention?: EmailRetention, expiresAt?: number }, string | null>
      /** A send that leaves no record: the `otp` template's codes. */
      sendSecret: FunctionReference<'mutation', 'internal', SendEmailOptions & { retention?: EmailRetention, expiresAt?: number }, string | null>
      status: FunctionReference<'query', 'internal', { emailId: string }, EmailStatus | null>
      get: FunctionReference<'query', 'internal', { emailId: string }, EmailRecord | null>
      cancel: FunctionReference<'mutation', 'internal', { emailId: string }, null>
      /** Pruning of the provider component's email records, which the component's maintenance also runs. */
      cleanup: FunctionReference<'mutation', 'internal', { olderThanMs?: number }, null>
      cleanupAbandoned: FunctionReference<'mutation', 'internal', { olderThanMs?: number }, null>
      handleWebhook: FunctionReference<'action', 'internal', { body: string, headers: Record<string, string> }, { status: number, body: string, type?: string }>
      /** The dev inbox: the mail a test address received, read from the provider's log of sent email (test mode only). */
      inbox: FunctionReference<'action', 'internal', { address: string }, SandboxMessage[]>
    }
    webhooks: WebhookLogRefs
    /** Each person's topic choices and the sending rules' counts (`setupEmail({ topics, caps })`). */
    preferences?: unknown
    /** The announcements the admin console publishes, and their broadcasts. */
    announcements?: unknown
    /** The provider's suppression list, mirrored from its webhook events: what sign-in reads before it sends a code. */
    suppressions?: unknown
    /** The waitlist, whose launch-news contacts a launch announcement goes to. */
    waitlist?: unknown
    /** Each person's runs of the lifecycle flows, and the events `email.automations.track` sends. */
    lifecycle?: unknown
    /** The contact form and inbound mail, in a backend component that has them; `setupEmail({ inbound, contact })` needs it. */
    inbound?: Record<string, unknown>
    /**
     * The auth tables' reader, where the recipient's language and the
     * sender's are read (`user.locale`). The generated `components` object
     * has it; without it, every email is written in the default locale.
     */
    adapter?: { findOne: unknown }
  }
  /** The rate limiter component, when the app mounts one: the contact form and inbound mail spend its limits. */
  rateLimiter?: unknown
}

/**
 * A message in the dev inbox: what test mode sent to one of the provider's
 * test addresses (`delivered+label@resend.dev`) within the last hour, read
 * back from the provider's log of sent email. Only the newest carries its
 * body. Part of the experimental dev inbox (`useSandboxInbox`, STABILITY.md).
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
 * What sending a template needs: a mutation's or an action's ctx. Its
 * `runQuery`, which every function ctx has, reads the recipient's language.
 */
type SendCtx = RunMutationCtx & Partial<RunQueryCtx>

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

/**
 * `inbox.email.received` payload data: mail that reached an inbox at the
 * provider (the support address), with its thread. The body is fetched with
 * the provider's API.
 */
export interface InboxEmailEventData {
  inbox_id?: string
  thread_id?: string
  email_id?: string
  thread?: { id?: string, subject?: string | null, folder?: string, read?: boolean }
  email?: { id?: string, direction?: string, from?: string, to?: string[], subject?: string | null, received_at?: string }
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

/** `contact.topics.updated` payload data: the topics that changed, each with its new subscription. */
export interface ContactTopicsEventData {
  email?: string
  topics?: Array<{ id: string, subscription: 'opt_in' | 'opt_out' }>
  [key: string]: unknown
}

/** `suppression.*` payload data: an address the provider will not send to, and why (`bounce`, `complaint`, `manual`). */
export interface SuppressionEventData {
  id?: string
  email?: string
  origin?: string
  source_id?: string | null
  created_at?: string
  [key: string]: unknown
}

/** `topic.*` payload data. */
export interface TopicEventData {
  id?: string
  name?: string
  description?: string | null
  default_subscription?: 'opt_in' | 'opt_out'
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
    : T extends 'contact.topics.updated' ? ContactTopicsEventData
      : T extends `inbox.${string}` ? InboxEmailEventData
        : T extends `contact.${string}` ? ContactEventData
          : T extends `suppression.${string}` ? SuppressionEventData
            : T extends `topic.${string}` ? TopicEventData
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

/**
 * How long the backend component keeps the email records, in milliseconds.
 * The component's maintenance prunes by it every hour; each send carries it,
 * so a change applies from the next email sent.
 */
export interface EmailRetention {
  /** After an email's final status (delivered, bounced, failed, cancelled). Default 7 days. */
  finalizedMs?: number
  /** After an email was created, when it never got a final status. Default 30 days. */
  abandonedMs?: number
}

export interface SetupEmailOptions {
  /**
   * How long the email records are kept, longer or shorter than the
   * defaults (7 days after a final status, 30 days without one). Both are
   * windows in milliseconds; the component's maintenance prunes by them.
   * Secret emails (sign-in codes, account deletion) leave no record at all.
   */
  retention?: EmailRetention
  /**
   * Restyle any email the package sends, by template name: `otp`,
   * `emailChanged`, `deletionScheduled`, `deletionCanceled`, `welcome`, `invite`, `gift`. Each
   * override gets the template's data and its render context, the default
   * included:
   * `invite: (data, { byDefault }) => ({ ...byDefault(data), subject: 'Join us' })`.
   */
  templates?: EmailTemplateOverrides
  /**
   * The app the emails are sent for, as the layout's header and footer show
   * it. `name` defaults to the display name of `EMAIL_FROM` (`Acme` in
   * `Acme <hello@acme.com>`), then the host of `SITE_URL`. `logo` is the
   * image the header shows in its place: an absolute URL, or a path on
   * `SITE_URL` (`/logo.png`). Keep both as `appConfig.backend.brand` has
   * them: the backend cannot read app config.
   */
  brand?: { name?: string, logo?: string, address?: string }
  /**
   * The topics your app sends under, keyed by the name your code sends by:
   * `send({ topic })` checks each person's choice, adds the one-click
   * unsubscribe and the postal address, and sends from the marketing
   * sender. `npx nuxt-backend email sync` creates them at the provider.
   *
   * @example
   * ```ts
   * topics: {
   *   productNews: { name: 'Product news', description: 'New features, about once a month.', subscribedByDefault: false, doubleOptIn: true },
   * }
   * ```
   */
  topics?: EmailTopics
  /**
   * The rules every send under a topic follows, with lifecycle email and the
   * email and push channels of notifications: `perWeek` (no default),
   * `quietHours` in each person's time zone (no default) and
   * `sunsetAfterDays` (180).
   */
  caps?: EmailCaps
  /**
   * The values your app keeps on each contact at the provider, which
   * lifecycle email and broadcasts read (`plan: { type: 'string', fallback: 'free' }`).
   * `npx nuxt-backend email sync` creates them.
   */
  contactProperties?: Readonly<Record<string, EmailContactProperty | EmailContactProperty['type']>>
  /**
   * The ready-made lifecycle flows to turn on, by name: `welcome`,
   * `activationNudge`, `firstResult`, `creditsLow`, `trialEnding`,
   * `checkoutAbandoned`, `winBack`, `stalled`, `annualSwitch`, `reviewAsk`.
   * Each is a template and an automation at the email provider, which
   * `npx nuxt-backend email sync` makes; the package starts and stops each
   * person's run from its own events, and checks a lifecycle or marketing
   * flow's email against the person's topic, the sunset rule, the weekly cap
   * and the quiet hours when it is due. Lifecycle and marketing flows name
   * the `topic` they go under.
   *
   * @example
   * ```ts
   * lifecycle: { welcome: true, activationNudge: { topic: 'tips' }, firstResult: { event: 'app.strip_ready' }, winBack: { topic: 'offers', days: [7, 30] } }
   * ```
   */
  lifecycle?: EmailLifecycle
  /**
   * The look of every email's layout: `colors` for the light scheme (the
   * page `background`, the message `card`, its `text`, the `accent` of
   * buttons and the code block and the `accentText` on it), `dark` for
   * readers in dark mode (derived from `colors` where left out), and
   * `fonts` (`heading`, `body`) as CSS font stacks. Every key is optional:
   * what you leave out keeps the package's default. Colors are hex; setup
   * refuses anything else.
   *
   * @example
   * ```ts
   * theme: {
   *   colors: { background: '#fff7e6', accent: '#d500f9' },
   *   fonts: { heading: "'Archivo Black', Arial, sans-serif" },
   * }
   * ```
   */
  theme?: EmailTheme
  /**
   * The emails' words in other languages, keyed by locale: pass the app's
   * i18n message files as they are (`messages: { de, fr }`). The package's
   * keys are read under `backend.email` (`backend.email.welcome.subject`),
   * an app's own (for its overrides and `compose`) from the root. A key a
   * language leaves out reads English. Each email is written in its
   * recipient's language (`user.locale`) when the app serves it (`locales`,
   * else the languages here), else in `defaultLocale`. An app key a
   * language leaves out reads `defaultLocale`'s, then English.
   */
  messages?: EmailMessages
  /**
   * The languages the app serves, as its `@nuxtjs/i18n` `locales` codes
   * (`['en', 'de', 'es']`). An email is written, and its links prefixed,
   * only in one of these or `defaultLocale`, so a link never carries a
   * language the app's pages don't answer in. Default: the languages
   * `messages` carries; with no `messages`, the package's own
   * translations (ru, de, es, fr) and English, unless `localePaths`
   * prefixes the links, which then stay in `defaultLocale`. Name them to
   * use a translation of the package's that your `messages` don't carry.
   */
  locales?: readonly string[]
  /**
   * The language for a recipient whose own has no messages, and for one
   * whose language is unknown (an invitee without an account, whose
   * inviter's is unknown too). Default `'en'`.
   */
  defaultLocale?: string
  /**
   * Whether the links the emails carry to the app's pages (an invitation,
   * a gift) carry the recipient's language in their path, as your
   * `@nuxtjs/i18n` `strategy` does: `prefix_except_default` turns
   * `/accept-invitation` into `/fr/accept-invitation` for a French reader.
   * Default `no_prefix`: links stay as they are.
   */
  localePaths?: EmailLocalePaths
  /**
   * React to any verified provider event, keyed by its event name
   * (`'email.bounced'`, `'contact.created'`, …). Handlers run **after** the
   * component has verified the signature and updated delivery status —
   * `useEmailStatus` already reflects the event. A handler throw answers 500,
   * so the provider redelivers (deliveries are deduped once fully processed).
   *
   * @guarantee
   * - Runs: in the webhook's HTTP action, after the email's delivery status is updated
   * - Delivery: at least once: a delivery already processed answers 200 without running it again, but one that threw is redelivered
   * - Order: as the provider delivers: no order across events
   * - When it throws: logged as `handler_error`, answered 500, and the provider retries
   * - Idempotency: key what it writes on the event's id
   */
  events?: EmailWebhookEventHandlers
  /**
   * Called for a **verified** event whose type is outside the known catalog
   * (a provider newer than this package). Acknowledged 202 when it returns; a
   * throw answers 500, and the provider redelivers.
   *
   * @guarantee
   * - Runs: in the webhook's HTTP action, for a verified event of a type this package does not know
   * - Delivery: at least once: answered 202 when it returns, and redelivered when it throws
   * - Order: as the provider delivers: no order across events
   * - When it throws: logged as `handler_error`, answered 500, and the provider retries
   * - Idempotency: key what it writes on the event's id
   */
  onUnknownEvent?: (ctx: AnyActionCtx, event: { type?: string, payload: unknown }) => Promise<void>
  /**
   * Mail sent to your app: the receiving domain, the support inbox and the
   * hooks that handle replies and workspace mail. Unset, an `email.received`
   * event goes to `events` alone.
   */
  inbound?: InboundOptions
  /** The contact form (`<ContactForm>`, `submitContactMessage`): where a message is copied when there is no support inbox. */
  contact?: ContactOptions
  /**
   * Your `setupRateLimiter` instance, for the limits the contact form and
   * inbound mail spend (`contact`, `contactGlobal`, `inboundMail`,
   * `inboundMailGlobal`, and `admin` for a reply from the Inbox tab), so
   * your overrides of them apply. Default: the rate limiter component
   * mounted as `rateLimiter`, with the package's limits.
   */
  rateLimiter?: InboundRateLimiter
  /**
   * The app's `setupAudit` instance (`backend/audit.ts`): a bounce to an
   * account's address is recorded through it (`email.bounced`), so it
   * reaches its `onEvent` too. Without it, on the component's own trail.
   */
  audit?: Pick<Audit, 'recordBackendEvent'>
  /**
   * The app-wide roles that run the admin console's email tabs
   * (Announcements, and the Inbox's reads and replies), read fresh. Default
   * `['admin']`: pass the same as `setupAdmin` and `setupAuth({ admin })`.
   */
  adminRoles?: readonly string[]
  /** Accounts that run the email tabs whatever their role, by id: pass the same as `setupAdmin`. */
  adminUserIds?: readonly string[]
  /**
   * The app's paths, from the `paths.generated.ts` the Nuxt module writes
   * from nuxt.config: an email's unsubscribe and confirmation links open
   * `{SITE_URL}{paths.unsubscribe}` (`pages.unsubscribe`, `/unsubscribe` by
   * default).
   */
  paths?: Partial<BackendPaths>
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

/** Where marketing mail comes from when a broadcast names no sender: the marketing sender, else the transactional one, else the provider's onboarding address. */
function marketingSender(): string {
  return process.env.EMAIL_MARKETING_FROM || process.env.EMAIL_FROM || 'onboarding@resend.dev'
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
     * The mail test mode sent to one of the provider's test addresses within
     * the last hour, newest first, read back from the provider's own log of
     * sent email with the deployment's `EMAIL_API_KEY` (nothing is kept
     * here) — for a demo, a preview deployment or an e2e run that has to read
     * a sign-in code without a real mailbox. A public action, unauthenticated
     * by design (the visitor is not signed in yet), so knowing an address is
     * enough to read its mail: re-export it only where every account is a
     * throwaway test one. It answers only once the deployment opts in with
     * `EMAIL_DEV_INBOX=1` (`nuxt-backend dev` sets it on dev deployments) and
     * its `BACKEND_ENVIRONMENT` is set and not `production`; empty
     * otherwise, for any other address, and without a key. It answers
     * nothing for an address whose account is an administrator's (`adminRoles`,
     * `adminUserIds`) or passkey-only. Experimental, with
     * `useSandboxInbox` (STABILITY.md).
     */
    getSandboxInbox: ReturnType<typeof actionGeneric>
    /**
     * Internal functions for the DevTools Email tab, which runs them with
     * the Convex CLI on a dev deployment: `previewEmails` renders every
     * packaged email with sample data in one language, and
     * `sendEmailPreview` sends one of them to a sandbox address
     * (`delivered@resend.dev`, or another `…@resend.dev` sandbox address),
     * refusing any other. Internal, so no client reaches them. Experimental,
     * with the DevTools tab (STABILITY.md): the samples and what a preview carries may still change.
     */
    previewEmails: ReturnType<typeof internalQueryGeneric>
    sendEmailPreview: ReturnType<typeof internalMutationGeneric>
    /**
     * `npx nuxt-backend email sync`: creates the topics at the provider,
     * subscribes the webhook to the events the preferences need, and reads
     * the senders' region and DMARC. Internal: the CLI runs it.
     */
    syncEmail: ReturnType<typeof syncEmailAction>
    /**
     * The contact form's write (`<ContactForm>` calls it): a public action,
     * so the bot check can verify a challenge. It checks the message, the
     * honeypot, the bot check and the limits, stores the message and queues
     * its copy for the team, in the background. Refused as `invalid_input` on
     * a field, `forbidden` (reason `bot_check`) or `rate_limited`.
     */
    submitContactMessage: ReturnType<typeof actionGeneric>
    /** The admin console's Inbox tab: the contact messages and the inbound mail, newest first. `null` for anyone who is not an administrator now. */
    getInboxConsole: ReturnType<typeof queryGeneric>
    /** An administrator's reply to a thread of the support inbox, from the Inbox tab; it goes out from the support address and stays on the thread. In person, with a recent sign-in. */
    replyToInbox: ReturnType<typeof actionGeneric>
    /**
     * Prepare the provider for inbound mail, run by `npx nuxt-backend email
     * sync` with the Convex CLI: it finds or creates the support inbox, completes
     * the webhook's events and reports what is left to do. Internal.
     */
    syncInbound: ReturnType<typeof internalActionGeneric>
  } & EmailPreferencesApi & AnnouncementsApi & SuppressionsApi
  /** The languages the emails are written in: the default locale first, then each one `messages` has, and English. */
  locales: readonly string[]
  /**
   * The app the emails are sent for, as the deployment names it now:
   * `brand.name`, else the display name of `EMAIL_FROM`, else the host of
   * `SITE_URL`; and the logo. `setupAuth` names the app after it where
   * Better Auth shows a name (a passkey prompt).
   */
  brand: () => EmailBrand
  /**
   * Send an email (call from your own gated action or mutation). Without a
   * `topic` it is transactional and always goes. With one, it goes only to
   * a person in the topic, under the sending rules, from the marketing
   * sender, with the one-click unsubscribe and the postal address; else it
   * resolves `null` and logs why (`email.skipped_unsubscribed`,
   * `email.skipped_capped`, `email.skipped_sunset`).
   */
  send: (ctx: RunMutationCtx & Partial<RunQueryCtx>, options: SendEmailOptions & { topic?: string }) => Promise<string | null>
  /** The topics `setupEmail` declares. */
  topics: EmailTopics
  /** Events your code sends the email provider's automations: `track(ctx, { event, userId, data })`. */
  automations: EmailAutomations
  /**
   * The ready-made flows the package runs: the auth layer starts the
   * sign-up ones.
   *
   * @internal
   */
  lifecycle: EmailLifecycleRunner
  /**
   * The preference center's parts the other helpers use: the RFC 8058
   * route (`registerBackendRoutes` mounts it), the soft opt-in at checkout
   * (`setupBilling` calls it), and engagement for the sunset rule.
   *
   * @internal
   */
  preferences: EmailPreferences
  /**
   * An address on the receiving domain (`setupEmail({ inbound: { domain } })`)
   * that carries a person and a thread, for an email's `replyTo`. The same pair
   * always gets the same address. A reply to it reaches `inbound.onReply`,
   * once the sender passes DMARC and is that person's own address.
   */
  replyAddress: (ctx: RunMutationCtx, options: { userId: string, thread: string }) => Promise<string>
  /**
   * Render one of the package's emails, your override or the packaged
   * default, without sending it: what a preview page or a test shows, in
   * `locale` (the default locale without one). Resolves once an async
   * override has rendered.
   */
  render: <Name extends EmailTemplateName>(name: Name, data: EmailTemplateData<Name>, options?: { locale?: string }) => Promise<EmailMessage>
  /**
   * Every email the package sends, rendered with sample data in `locale`:
   * one entry per template, and per purpose of the `otp` template, as the
   * DevTools Email tab and the playground show them. Experimental, with the
   * DevTools tab (STABILITY.md): the samples and what a preview carries may
   * still change.
   */
  previews: (options?: { locale?: string }) => Promise<EmailPreview[]>
  /**
   * Build an email of your own in the layout the package's emails use: the
   * brand's header, a card, the footer, light and dark, in the `theme`.
   * `build` gets the render context of `locale` (its `t` reads
   * `messages`), and returns the message with its body as `blocks`
   * (a kicker, a heading, paragraphs, a code, a button, a note: themed,
   * escaped, with the text version written for you) or as an HTML fragment in
   * `html` (build it with the `html` tag, which escapes what it
   * interpolates; `text` then gets the footer's words). Send the result with
   * `send`. A `build` that returns `null` (nothing to send) resolves
   * with `null`.
   *
   * @example
   * ```ts
   * const message = await email.compose(({ t, brand }) => ({
   *   to: user.email,
   *   subject: t('digest.subject'),
   *   blocks: [
   *     { heading: t('digest.subject') },
   *     { paragraph: t('digest.intro', { name: user.name }) },
   *     { button: { label: t('digest.open'), url: `${brand.url}/digest` } },
   *   ],
   * }), { locale: user.locale })
   * await email.send(ctx, message)
   * ```
   */
  compose: <Message extends EmailMessage | null>(build: (context: EmailRenderContext) => Message | Promise<Message>, options?: { locale?: string | null }) => Promise<Message>
  /**
   * Render one of the package's emails and send it, in its recipient's
   * language: `locale` when given, else the language of the account the
   * address belongs to (`user.locale`), else `fallbackLocale`, else the
   * language of the account `senderId` names (an inviter, a gift's
   * purchaser), else the default locale. A secret email (`otp`) leaves
   * no record: it resolves with `null` and has no
   * status, and its body is gone once the provider answers. An override
   * that puts the code in the subject puts it where the provider's own logs
   * keep it.
   */
  sendTemplate: <Name extends EmailTemplateName>(
    // A mutation's or an action's ctx; its `runQuery` reads the recipient's language.
    ctx: RunMutationCtx & Partial<RunQueryCtx>,
    name: Name,
    data: EmailTemplateData<Name>,
    options?: {
      /** The language to write in, over the recipient's own. */
      locale?: string | null
      /** A guess for a recipient without an account: the language of the request that asked for the email. */
      fallbackLocale?: string | null
      /** The account the email is sent on behalf of: a recipient without an account reads it in that account's language. */
      senderId?: string
      idempotencyKey?: string
      /** For a secret email: when its secret stops working (epoch ms). It is not sent after that. */
      expiresAt?: number
    },
  ) => Promise<string | null>
  /** Read an email's delivery status. */
  status: (ctx: RunQueryCtx, emailId: string) => Promise<EmailStatus | null>
  /** Cancel a not-yet-sent email. */
  cancel: (ctx: RunMutationCtx, emailId: string) => Promise<void>
  /**
   * Prune finalized email records (delivered, bounced, cancelled, failed …)
   * older than `olderThanMs` — default 7 days. Schedules the provider's
   * batched cleanup and returns at once. The component's maintenance already
   * runs it every hour with the default, so call it only to keep records for
   * less time.
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
  /**
   * Marketing broadcasts: create / send (optionally scheduled). A broadcast
   * with no `from` goes from `EMAIL_MARKETING_FROM`, else `EMAIL_FROM`, else the
   * provider's onboarding sender: marketing mail keeps to the subdomain apart
   * from the transactional one when the deployment names it.
   */
  broadcasts: {
    create: (payload: Omit<Parameters<ResendSdk['broadcasts']['create']>[0], 'from'> & { from?: string }) => Promise<unknown>
    send: (id: string, payload?: Parameters<ResendSdk['broadcasts']['send']>[1]) => Promise<unknown>
  }
  /**
   * The email part of an account's erasure, which `setupAccount` runs: the
   * address's contact at the provider is removed, with the segments and
   * topics it was in. Nothing to remove without `EMAIL_API_KEY`, and a
   * contact already gone is fine, so it is safe to run again; any other
   * refusal throws `unavailable` (reason `provider_refused`).
   */
  forgetContact: (email: string) => Promise<void>
}

/** The most recipients of one bounced email whose accounts a bounce is recorded for. */
const BOUNCE_RECIPIENTS_MAX = 50

/** The templates whose emails carry a secret, and so leave no record: a sign-in code. */
const SECRET_TEMPLATES: ReadonlySet<string> = new Set<EmailTemplateName>(['otp'])

/** `retention`, refused at setup when a window is not a positive number of milliseconds. */
function checkedRetention(retention: EmailRetention | undefined): EmailRetention | undefined {
  for (const [name, value] of Object.entries(retention ?? {})) {
    if (value !== undefined && !(typeof value === 'number' && Number.isFinite(value) && value > 0)) {
      throw new Error(`[nuxt-backend] setupEmail: retention.${name} must be a positive number of milliseconds.`)
    }
  }
  return retention && Object.keys(retention).length > 0 ? retention : undefined
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
  const renderer = createEmailRenderer(options, () => ({ siteUrl: readProcessEnv('SITE_URL'), from: readProcessEnv('EMAIL_FROM') }))
  const unsubscribePath = resolveBackendPaths(options.paths, 'setupEmail').unsubscribe
  const findUser = components.backend.adapter?.findOne as FunctionReference<'query', 'internal', { model: string, where: Array<{ field: string, value: string }> }, unknown> | undefined

  // Always explicit, `{}` for the defaults: a send without one means no
  // opinion to the component, and leaves the recorded setting alone.
  const retention = checkedRetention(options.retention) ?? {}
  const topics = options.topics ?? {}
  const problem = (() => {
    const topicProblem = topicsProblem(topics)
    if (topicProblem) return `topics.${topicProblem}`
    const capProblem = options.caps ? capsProblem(options.caps) : null
    if (capProblem) return `caps.${capProblem}`
    const flowProblem = options.lifecycle ? lifecycleProblem(options.lifecycle, topics) : null
    return flowProblem ? `lifecycle: ${flowProblem}` : null
  })()
  if (problem) throw new TypeError(`[nuxt-backend] setupEmail: ${problem}`)
  const address = () => options.brand?.address?.trim() || undefined

  const render: Email['render'] = (name, data, renderOptions = {}) => renderer.render(name, data, renderOptions.locale)

  /**
   * The language an account reads in, by its address or its id; `null` when
   * there is none, or nothing to read it with. A read that fails (an id that
   * is no account's, a component call that threw) is logged and reads as
   * none: the language is a preference, and the email still goes.
   */
  const accountLocale = async (ctx: SendCtx, field: 'email' | '_id', value: string | undefined): Promise<string | null> => {
    if (!value || !findUser || typeof ctx.runQuery !== 'function') return null
    try {
      const user = await ctx.runQuery(findUser, { model: 'user', where: [{ field, value: field === 'email' ? normalizeEmail(value) : value }] }) as { locale?: unknown } | null
      return normalizeLocale(user?.locale)
    }
    catch (error) {
      const whose = field === 'email' ? 'recipient' : 'sender'
      logBackend('warn', 'email.locale_unread', `The ${whose} account's language could not be read; the email goes in the next language known.`, error)
      return null
    }
  }

  const preferences = createEmailPreferences({
    refs: components.backend.preferences as never,
    topics,
    caps: options.caps ?? {},
    address,
    unsubscribePath,
    sendConfirmation: (ctx, data) => sendTemplate(ctx, 'topicConfirmation', data),
  })

  const send: Email['send'] = async (ctx, { topic, ...message }) => {
    if (topic === undefined) return ctx.runMutation(refs.send, { ...message, retention })
    // The footer's words, in the recipient's language.
    const words = async (email: string) => ({ unsubscribe: renderer.context(await accountLocale(ctx, 'email', email)).t('email.layout.unsubscribe') })
    const prepared = await preferences.prepare(ctx, message, topic, words)
    return prepared ? ctx.runMutation(refs.send, { ...prepared, retention }) : null
  }

  const sendTemplate: Email['sendTemplate'] = async (ctx, name, data, { locale, fallbackLocale, senderId, idempotencyKey, expiresAt } = {}) => {
    // The first language that is known, in the documented order; each read
    // only when the ones before it said nothing.
    const wanted = normalizeLocale(locale)
      ?? await accountLocale(ctx, 'email', recipientOf(name, data))
      ?? normalizeLocale(fallbackLocale)
      ?? await accountLocale(ctx, '_id', senderId)
    const message = { ...(await renderer.render(name, data, wanted)), ...(idempotencyKey ? { idempotencyKey } : {}), retention }
    return SECRET_TEMPLATES.has(name)
      ? ctx.runMutation(refs.sendSecret, { ...message, ...(expiresAt !== undefined ? { expiresAt } : {}) })
      : ctx.runMutation(refs.send, message)
  }

  const previews: Email['previews'] = (previewOptions = {}) => renderer.previews(previewOptions.locale)
  const compose: Email['compose'] = (build, composeOptions = {}) => renderer.compose(build, composeOptions.locale)

  // The DevTools Email tab's two functions, run with the Convex CLI's admin
  // key: internal, so they never take a request from a page.
  const previewEmails = internalQueryGeneric({
    args: { locale: v.optional(v.string()) },
    handler: async (_ctx, args): Promise<{ locales: readonly string[], locale: string, previews: EmailPreview[] }> => ({
      locales: renderer.locales,
      locale: renderer.resolveLocale(args.locale),
      previews: await renderer.previews(args.locale),
    }),
  })
  const sendEmailPreview = internalMutationGeneric({
    args: { key: v.string(), locale: v.optional(v.string()), to: v.optional(v.string()) },
    handler: async (ctx, args): Promise<string | null> => {
      const to = normalizeEmail(args.to ?? 'delivered@resend.dev')
      // A preview carries sample data, a sample code included: it goes to
      // the provider's sandbox addresses only, never to a person.
      if (!isSandboxAddress(to)) throw backendError('invalid_input', { field: 'to' }, 'A preview goes to a sandbox address only, such as delivered@resend.dev.')
      const preview = (await renderer.previews(args.locale)).find(entry => entry.key === args.key)
      if (!preview) throw backendError('invalid_input', { field: 'key' }, `No email preview is called ${args.key}.`)
      return await send(ctx, { to, subject: preview.subject, html: preview.html, text: preview.text })
    },
  })

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

  // A bounce is recorded for the account its address belongs to: the app's
  // trail, else the component's own (a component built before it has none).
  const backend = components.backend as { audit?: unknown, adapter?: unknown }
  const trail = options.audit ?? (backend.audit && backend.adapter ? setupAudit(components as never) : undefined)
  // The suppression copy, in a backend component that keeps one.
  const suppressionRefs = (components.backend as { suppressions?: SuppressionRefs }).suppressions

  /**
   * Record `email.bounced` for each account a bounced email went to, the app
   * acting; an address no account holds records nothing, and nothing of
   * the address is kept. Never the delivery's failure.
   */
  const recordBounce = async (ctx: AnyActionCtx, payload: unknown): Promise<void> => {
    if (!trail || !findUser) return
    const to = (payload as { data?: { to?: unknown } } | null)?.data?.to
    const addresses = (Array.isArray(to) ? to : [to]).filter((address): address is string => typeof address === 'string').slice(0, BOUNCE_RECIPIENTS_MAX)
    for (const address of addresses) {
      try {
        const user = await ctx.runQuery(findUser, { model: 'user', where: [{ field: 'email', value: normalizeEmail(address) }] }) as { _id?: string } | null
        if (user?._id) await trail.recordBackendEvent(ctx as unknown as AuditCtx, { type: 'email.bounced', actor: null, subjectId: user._id })
      }
      catch (error) {
        logBackend('warn', 'audit.record_failed', 'An email.bounced event was not recorded; the delivery went through.', error)
      }
    }
  }

  /**
   * What the package does with a verified event before the app's handler:
   * a suppression (added, lifted, or a send the provider dropped) is
   * mirrored, a bounce is recorded for its account, the deployment's copy of each
   * person's choices follows the provider's, a click restarts the sunset
   * rule, and mail sent to the app is routed, checked and stored.
   */
  const builtIns = async (ctx: AnyActionCtx, type: string, payload: unknown): Promise<void> => {
    const event = payload as { data?: { to?: unknown }, created_at?: unknown } | null
    const data = event?.data
    // When the provider made the change: a late or repeated event never undoes a newer choice.
    const madeAt = typeof event?.created_at === 'string' ? Date.parse(event.created_at) : Number.NaN
    const at = Number.isFinite(madeAt) ? madeAt : undefined
    // The provider's suppression list, mirrored: what sign-in reads before it sends a code.
    await followSuppressionEvent(ctx as never, suppressionRefs, type, payload)
    if (type === 'email.bounced') await recordBounce(ctx, payload)
    else if (type === 'contact.topics.updated') await preferences.providerTopics(ctx, data, at)
    else if (type === 'contact.updated') await preferences.providerContact(ctx, data, at)
    else if (type === 'email.clicked') {
      const to = Array.isArray(data?.to) ? data.to[0] : data?.to
      if (typeof to === 'string') await preferences.engaged(ctx, { email: to })
    }
    else if (type === 'email.received' || type === 'inbox.email.received') await inboundMail.receive(ctx, payload as { type: string, data: unknown })
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
      deliveryId: deliveryIdOf(headers),
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
        // A bounce is recorded for its account, the preferences follow the provider's, and mail sent to the app is routed, checked and stored, before any handler of the app's sees the event.
        await builtIns(ctx, type, event.payload)
        const handler = events?.[type as EmailWebhookEventType]
        if (handler) await (handler as (ctx: AnyActionCtx, event: EmailWebhookEvent) => Promise<void>)(ctx, event.payload as EmailWebhookEvent)
        return { outcome: 'ok', type, response: new Response(result.body || null, { status: result.status }) }
      },
    })
  }

  const administrators = { roles: options.adminRoles ?? DEFAULT_ADMIN_ROLES, userIds: options.adminUserIds ?? [] }
  const suppressions = createSuppressions({ refs: suppressionRefs, findOne: findUser as never, administrators, audit: trail })

  const announcements = createAnnouncements({
    refs: { announcements: components.backend.announcements, preferences: components.backend.preferences, waitlist: components.backend.waitlist } as never,
    findOne: findUser as never,
    administrators,
    topics,
    address,
    unsubscribePath,
    audit: trail,
    compose: build => renderer.compose(build),
    send: (ctx, message) => send(ctx, message),
  })

  const flows = options.lifecycle ? lifecycleSettings(options.lifecycle, topics) : []
  const { automations, lifecycle } = createLifecycle({
    refs: components.backend.lifecycle as never,
    findUser,
    flows: flows.map(flow => flow.flow as LifecycleFlow),
  })
  const contactProperties = Object.fromEntries(Object.entries(options.contactProperties ?? {}).map(([key, property]) => [key, typeof property === 'string' ? { type: property } : property]))

  const getEmailStatus = queryGeneric({
    args: { emailId: v.string() },
    // Delivery records carry recipient/error detail, so require a signed-in
    // caller — email ids leak via `send` return values, logs, and referrers,
    // and this is otherwise an unauthenticated lookup by opaque id.
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) return null
      return ctx.runQuery(refs.status, { emailId: args.emailId })
    },
  })

  const inboundMail = createInbound({
    components: components as unknown as Parameters<typeof createInbound>[0]['components'],
    inbound: options.inbound,
    contact: options.contact,
    ...(options.rateLimiter ? { rateLimiter: options.rateLimiter } : {}),
    ...(options.adminRoles ? { adminRoles: options.adminRoles } : {}),
    ...(options.adminUserIds ? { adminUserIds: options.adminUserIds } : {}),
  })

  // Whose mail the dev inbox never shows: an administrator's, and a
  // passkey-only account's. Anyone may read the inbox, so a code there must
  // never sign in to an account that matters more than a test account.
  const keepsMailPrivate = async (ctx: { runQuery: GenericActionCtx<GenericDataModel>['runQuery'] }, address: string): Promise<boolean> => {
    if (!findUser) return false
    const user = await ctx.runQuery(findUser, { model: 'user', where: [{ field: 'email', value: address.trim().toLowerCase() }] }) as { _id: string, role?: string | null, passkeyOnly?: boolean | null } | null
    return Boolean(user && (user.passkeyOnly === true || isAdministrator({ id: user._id, role: user.role }, administrators)))
  }

  const getSandboxInbox = actionGeneric({
    args: { address: v.string() },
    handler: async (ctx, args): Promise<SandboxMessage[]> => {
      // Opt-in, outside production only: a public reader of a team's sent mail.
      if (!publishesDevInbox(backendEnvironment(), readEnv('EMAIL_DEV_INBOX'))) return []
      // An administrator's and a passkey-only account's mail stays out of it.
      if (await keepsMailPrivate(ctx, args.address)) return []
      return ctx.runAction(refs.inbox, { address: args.address })
    },
  })

  return {
    api: {
      getEmailStatus,
      getSandboxInbox,
      previewEmails,
      sendEmailPreview,
      syncEmail: syncEmailAction({ providerIds: (components.backend.preferences as { providerIds: never } | undefined)?.providerIds, saveProviderIds: (components.backend.preferences as { saveProviderIds: never } | undefined)?.saveProviderIds, lifecycle: components.backend.lifecycle } as never, {
        topics,
        contactProperties,
        address,
        lifecycle: {
          flows,
          caps: resolveCaps(options.caps),
          email: flow => flowEmail(flow, build => renderer.compose(build), { address: address(), unsubscribeUrl: PROVIDER_UNSUBSCRIBE_URL }),
          from: (flow) => {
            const topic = flows.find(entry => entry.flow === flow)?.topic?.key
            return (topic ? topics[topic]?.from : undefined) ?? (flows.find(entry => entry.flow === flow)?.kind === 'transactional' ? readProcessEnv('EMAIL_FROM') : readProcessEnv('EMAIL_MARKETING_FROM') ?? readProcessEnv('EMAIL_FROM'))
          },
        },
      }),
      ...preferences.api,
      ...announcements,
      ...suppressions,
      ...inboundMail.api,
    },
    topics,
    automations,
    lifecycle,
    preferences,
    locales: renderer.locales,
    brand: () => renderer.context().brand,
    replyAddress: inboundMail.replyAddress,
    send,
    render,
    previews,
    compose,
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
      create: payload => unwrap(marketingClient().broadcasts.create({ ...payload, from: payload.from ?? marketingSender() } as Parameters<ResendSdk['broadcasts']['create']>[0])),
      send: (id, payload) => unwrap(marketingClient().broadcasts.send(id, payload)),
    },
    forgetContact,
  }
}

/** Remove an address's contact at the provider; one it does not have is fine (see `Email.forgetContact`). */
async function forgetContact(email: string): Promise<void> {
  if (!readProcessEnv('EMAIL_API_KEY')) return
  const { error } = await marketingClient().contacts.remove({ email: normalizeEmail(email) })
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  if (!error || error.name === 'not_found' || status === 404) return
  throw backendError('unavailable', { service: 'email', reason: 'provider_refused' }, `[nuxt-backend] Resend: ${error.message}`)
}

function readProcessEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}

export { escapeHtml, forceColorScheme, html, trustedHtml }
export { describeOrigin, linkBlocks, plainName } from '../email-helpers.js'
