import type { Polar } from '@polar-sh/sdk'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { runConvex } from '../../convex-cli'
import { isProviderNotFound } from '../../convex/integrations/billing/context'
import { deploymentFlags } from '../../env-push'
import { finding, type PreflightFinding } from '../../findings'

// Whether the deployment's billing data is the organization's that
// BILLING_ACCESS_TOKEN names. The billing provider's component maps each
// billing entity onto a customer id once and never forgets it, so after the
// token moves to another organization (a new sandbox, say) every mapped
// customer is one the provider does not know, and each entity's billing is
// refused (`unavailable`, reason `customer_unknown`). doctor samples the
// mapped customers and asks the provider for each; `billing reset` clears
// them on a dev deployment.

/** The billing provider's component, as the scaffold mounts it (`app.use(polar)`). */
export const PROVIDER_COMPONENT = 'polar'

/** How many mapped customers doctor asks the provider about: the first ones mapped, which a token that moved left behind first. */
const SAMPLE_SIZE = 10

/** The read of the mapped customer ids, never anything else of the rows: the first {@link SAMPLE_SIZE}. */
export const MAPPED_CUSTOMERS_QUERY = `return (await ctx.db.query("customers").take(${SAMPLE_SIZE})).map(customer => customer.id)`

/** The customer ids the provider's component maps billing entities onto, a page of them; `null` when the deployment can't be read or has no such component. */
export async function readMappedCustomers(rootDir: string, { prod }: { prod: boolean }): Promise<string[] | null> {
  try {
    const { stdout } = await runConvex(rootDir, ['run', ...deploymentFlags({ prod }), '--component', PROVIDER_COMPONENT, '--inline-query', MAPPED_CUSTOMERS_QUERY])
    const ids = JSON.parse(stdout) as unknown
    return Array.isArray(ids) && ids.every(id => typeof id === 'string') ? ids : null
  }
  catch {
    return null
  }
}

/** What the provider said of the sampled customers: how many it knows, and how many it does not. */
export interface MappedCustomers {
  sampled: number
  unknown: number
}

/**
 * Ask the provider for each mapped customer. `null` when any answer is
 * neither the customer nor a "not found" (a refused token, no network): the
 * `billing-organization` finding reports a token that is refused.
 */
export async function checkMappedCustomers(client: Polar, ids: readonly string[]): Promise<MappedCustomers | null> {
  try {
    const answers = await Promise.all(ids.map(async (id) => {
      const found = await customersGet(client, { id })
      if (found.ok) return 'known'
      return isProviderNotFound(found.error) ? 'unknown' : 'unread'
    }))
    if (answers.includes('unread')) return null
    return { sampled: ids.length, unknown: answers.filter(answer => answer === 'unknown').length }
  }
  catch {
    return null
  }
}

/** The `billing-customer-mapping` finding for what the provider said; none when it could not tell. */
export function customerMappingFindings(read: MappedCustomers | null, { prod }: { prod: boolean }): PreflightFinding[] {
  if (!read) return []
  if (read.sampled === 0) return [finding('billing-customer-mapping', 'pass', 'No billing entity is mapped onto a provider customer yet.')]
  if (read.unknown === 0) return [finding('billing-customer-mapping', 'pass', `The provider knows the ${read.sampled === 1 ? 'customer' : `${read.sampled} customers`} the deployment maps billing entities onto (a sample).`)]
  const message = read.unknown === read.sampled
    ? `The provider knows none of the ${read.sampled === 1 ? 'customer' : `${read.sampled} customers`} the deployment maps billing entities onto: the deployment's billing data belongs to another organization than the one BILLING_ACCESS_TOKEN names (a new sandbox, say).`
    : `The provider does not know ${read.unknown} of the ${read.sampled} customers the deployment maps billing entities onto (a sample): billing data from another organization than the one BILLING_ACCESS_TOKEN names, or customers deleted at the provider.`
  return [finding(
    'billing-customer-mapping',
    'warn',
    `${message} Checkout, the portal and the free plan are refused for ${read.unknown === 1 ? 'that entity' : 'those entities'} (unavailable, reason customer_unknown).`,
    prod
      ? 'Point production\'s BILLING_ACCESS_TOKEN back at the organization its billing data came from (`npx convex env set --prod BILLING_ACCESS_TOKEN` asks for it). `billing reset` clears a dev deployment only.'
      : 'Run `npx nuxt-backend billing reset`: it syncs the catalog to the organization, clears the deployment\'s billing data and puts every billing entity back on the free plan. Or point BILLING_ACCESS_TOKEN back at the organization the data came from.',
  )]
}
