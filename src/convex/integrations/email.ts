import {
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  queryGeneric,
} from 'convex/server'
import { v } from 'convex/values'
import { Resend } from 'resend'

/**
 * The `email` function group exposed by the `backend` component (see
 * `src/convex/component/email.ts`), reachable from the app as
 * `components.backend.email`.
 */
export interface EmailComponentApi {
  email: {
    send: FunctionReference<'mutation', 'public', SendEmailOptions, string | null>
    status: FunctionReference<'query', 'public', { emailId: string }, EmailStatus | null>
    get: FunctionReference<'query', 'public', { emailId: string }, unknown>
    cancel: FunctionReference<'mutation', 'public', { emailId: string }, null>
    handleWebhook: FunctionReference<'action', 'public', { body: string, headers: Record<string, string> }, { status: number, body: string }>
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
  return new Resend(process.env.RESEND_API_KEY)
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
   * Handle a Resend event webhook from your app's `/resend-webhook` HTTP route
   * (inside an `httpAction`); returns the Response to send back.
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
 * App-facing email helper over the `backend` component's nested Resend: both
 * **transactional** email (send / status / cancel + webhook) and **marketing**
 * email (audiences / contacts / broadcasts via the Resend SDK).
 *
 * Transactional email needs only `RESEND_API_KEY`; marketing also uses it
 * directly. Unconfigured, transactional `send` logs instead of delivering.
 *
 * @example
 * ```ts
 * import { setupEmail } from 'nuxt-backend/convex/email'
 * import { components } from './_generated/api'
 *
 * export const email = setupEmail(components.backend)
 * export const { getEmailStatus } = email.api
 * ```
 */
export function setupEmail(component: EmailComponentApi): Email {
  const refs = component.email

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
    const result = await ctx.runAction(refs.handleWebhook, { body, headers })
    return new Response(result.body || null, { status: result.status })
  }

  const getEmailStatus = queryGeneric({
    args: { emailId: v.string() },
    handler: async (ctx, args) => ctx.runQuery(refs.status, { emailId: args.emailId }),
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

/** Re-export so consumers can keep the `send` argument validator aligned. */
export { sendArgs }
