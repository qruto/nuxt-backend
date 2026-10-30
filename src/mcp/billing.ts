/**
 * The `billing-*` tools: the billing provider's API (Polar), read with
 * `BILLING_ACCESS_TOKEN` from the process env or `.env.local`, as `billing
 * sync` reads it. The sandbox by default; production with `--prod`. Each
 * answers the first page, trimmed to the fields an agent needs.
 */
import { Polar } from '@polar-sh/sdk'
import { z } from 'zod'
import { providerClientOptions } from '../convex/integrations/billing/provider-client'
import { readEnvFiles } from '../env-push'
import { defineTool, limit, messageOf, ToolRefusal, type DevTool, type ToolContext } from './tools'

/** The provider client the tools use: tests pass a fake. */
export type BillingClient = Pick<Polar, 'products' | 'customers' | 'subscriptions' | 'events' | 'webhooks'>

/** The provider's environment the server reads. */
export const billingEnvironment = (prod: boolean) => (prod ? 'production' : 'sandbox')

/** The access token, where `billing sync` reads it: the process env over `.env.local`. */
export function billingAccessToken(rootDir: string): string | undefined {
  return process.env.BILLING_ACCESS_TOKEN || readEnvFiles(rootDir).BILLING_ACCESS_TOKEN || undefined
}

function client({ rootDir, prod }: ToolContext, create: (token: string, prod: boolean) => BillingClient): BillingClient {
  const token = billingAccessToken(rootDir)
  if (!token) {
    throw new ToolRefusal(`BILLING_ACCESS_TOKEN is not set: create an organization access token in your Polar ${billingEnvironment(prod)} (Settings → Developers), put it in .env.local${prod ? ', or in the env this server runs with for production' : ''}, then call again.`)
  }
  return create(token, prod)
}

/** The items of a list answer: a paged one's first page, or a plain one's. */
function itemsOf<T>(page: { result?: { items?: T[] }, items?: T[] }): T[] {
  return page.result?.items ?? page.items ?? []
}

/** A provider call, its failure said in words. */
async function read<T>(prod: boolean, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  }
  catch (error) {
    const message = messageOf(error)
    const auth = /401|403|unauthori[sz]ed|invalid_token|forbidden/i.test(message)
    throw new ToolRefusal(auth
      ? `The billing provider refused BILLING_ACCESS_TOKEN for its ${billingEnvironment(prod)}: ${message}. A sandbox token reads only the sandbox, and a production token only production.`
      : `The billing provider answered: ${message}`)
  }
}

const createClient = (token: string, prod: boolean): BillingClient => new Polar(providerClientOptions({ accessToken: token, environment: billingEnvironment(prod) }))

export function billingTools(create: (token: string, prod: boolean) => BillingClient = createClient): DevTool[] {
  const where = 'Polar\'s sandbox, or production with --prod'
  return [
    defineTool({
      name: 'billing-products',
      title: 'Billing products',
      description: `The products in ${where}: each with its prices, whether it recurs, whether it is archived, and the catalog key \`billing sync\` tagged it with.`,
      input: z.object({ archived: z.boolean().default(false).describe('Archived products instead'), limit }),
      provider: true,
      run: async ({ archived, limit }, context) => {
        const page = await read(context.prod, () => client(context, create).products.list({ isArchived: archived, limit }))
        return itemsOf(page).map(product => ({
          id: product.id,
          name: product.name,
          key: product.metadata?.key ?? null,
          recurringInterval: product.recurringInterval ?? null,
          isArchived: product.isArchived,
          prices: product.prices.map(price => ({ id: price.id, amountType: price.amountType, ...('priceAmount' in price ? { amount: price.priceAmount, currency: price.priceCurrency } : {}) })),
        }))
      },
    }),
    defineTool({
      name: 'billing-customers',
      title: 'Billing customers',
      description: `The customers in ${where}, newest first, or the ones whose email or name matches \`query\`.`,
      input: z.object({ query: z.string().max(200).optional().describe('Part of an email or a name'), limit }),
      provider: true,
      run: async ({ query, limit }, context) => {
        const page = await read(context.prod, () => client(context, create).customers.list({ ...(query ? { query } : {}), limit }))
        return itemsOf(page).map(customer => ({ id: customer.id, externalId: customer.externalId ?? null, email: customer.email, name: customer.name ?? null, createdAt: customer.createdAt }))
      },
    }),
    defineTool({
      name: 'billing-subscriptions',
      title: 'Billing subscriptions',
      description: `The subscriptions in ${where}, of one customer or of all: each with its product, status, period and whether it ends at the period's end.`,
      input: z.object({ customerId: z.string().max(100).optional().describe('One customer\'s, by the provider\'s customer id'), active: z.boolean().optional().describe('Only active, or only ended, subscriptions'), limit }),
      provider: true,
      run: async ({ customerId, active, limit }, context) => {
        const page = await read(context.prod, () => client(context, create).subscriptions.list({ ...(customerId ? { customerId } : {}), ...(active !== undefined ? { active } : {}), limit }))
        return itemsOf(page).map(subscription => ({
          id: subscription.id,
          customerId: subscription.customerId,
          productId: subscription.productId,
          product: subscription.product?.name ?? null,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }))
      },
    }),
    defineTool({
      name: 'billing-events',
      title: 'Billing usage events',
      description: `The usage events in ${where}, newest first: what metered credits and quotas count, of one customer or of all, by event name when given.`,
      input: z.object({ customerId: z.string().max(100).optional(), name: z.string().max(200).optional().describe('Only events of this name'), limit }),
      provider: true,
      run: async ({ customerId, name, limit }, context) => {
        const page = await read(context.prod, () => client(context, create).events.list({ ...(customerId ? { customerId } : {}), ...(name ? { name } : {}), limit }))
        return itemsOf(page as { items?: Array<Record<string, unknown>> }).map(event => ({ id: event.id, name: event.name, timestamp: event.timestamp, customerId: event.customerId ?? null, externalCustomerId: event.externalCustomerId ?? null, metadata: event.metadata ?? {} }))
      },
    }),
    defineTool({
      name: 'billing-webhook-deliveries',
      title: 'Billing webhook deliveries',
      description: `The webhook deliveries ${where} made, newest first: each with its event type, whether it succeeded and the status the app answered.`,
      input: z.object({ limit }),
      provider: true,
      run: async ({ limit }, context) => {
        const page = await read(context.prod, () => client(context, create).webhooks.listWebhookDeliveries({ limit }))
        return itemsOf(page).map(delivery => ({
          id: delivery.id,
          createdAt: delivery.createdAt,
          succeeded: delivery.succeeded,
          httpCode: delivery.httpCode ?? null,
          event: delivery.webhookEvent?.type ?? null,
        }))
      },
    }),
  ]
}
