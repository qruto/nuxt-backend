import { createCreemProvider } from './creem.js'
import { createDodoProvider } from './dodo.js'
import { createStripeProvider } from './stripe.js'
import { BILLING_PROVIDER_NAMES, type BillingProviderName, type CommerceProvider, type ProviderEnvironment, type ProviderOptions } from './types.js'

export { PROVIDER_CAPABILITIES } from './capabilities.js'
export * from './consent.js'
export * from './types.js'

/** The adapters built on the neutral seam. Polar is served by its Convex component (context.ts). */
const FACTORIES: Readonly<Record<Exclude<BillingProviderName, 'polar'>, (options: ProviderOptions) => CommerceProvider>> = {
  stripe: createStripeProvider,
  dodo: createDodoProvider,
  creem: createCreemProvider,
}

/**
 * The provider `BILLING_PROVIDER` names, `polar` when it is unset. A name
 * the package does not know is refused, so a typo never sells through the
 * wrong provider.
 *
 * @experimental
 */
export function billingProviderName(value: string | undefined): BillingProviderName {
  const name = (value ?? '').trim().toLowerCase() || 'polar'
  if ((BILLING_PROVIDER_NAMES as readonly string[]).includes(name)) return name as BillingProviderName
  throw new Error(`[nuxt-backend] BILLING_PROVIDER is "${value}": set it to one of ${BILLING_PROVIDER_NAMES.join(', ')}.`)
}

/** Whether a provider is served by the neutral adapters (every one but Polar). */
export function isAdapterProvider(name: BillingProviderName): name is Exclude<BillingProviderName, 'polar'> {
  return name !== 'polar'
}

/**
 * The adapter for `name`.
 *
 * @experimental
 */
export function createCommerceProvider(name: Exclude<BillingProviderName, 'polar'>, options: ProviderOptions): CommerceProvider {
  if (!options.apiKey) throw new Error(`[nuxt-backend] ${name} billing needs BILLING_ACCESS_TOKEN: the provider's secret API key.`)
  return FACTORIES[name](options)
}

/**
 * The adapter the deployment's env names: `BILLING_PROVIDER`, the key in
 * `BILLING_ACCESS_TOKEN`, and the provider's sandbox everywhere but
 * production. `null` for Polar, which the component path serves.
 *
 * @experimental
 */
export function commerceProviderFromEnv(env: Readonly<Record<string, string | undefined>>, environment: ProviderEnvironment, fetchImpl?: typeof fetch): CommerceProvider | null {
  const name = billingProviderName(env.BILLING_PROVIDER)
  if (!isAdapterProvider(name)) return null
  return createCommerceProvider(name, { apiKey: env.BILLING_ACCESS_TOKEN ?? '', environment, fetch: fetchImpl })
}

/**
 * The webhook secrets the env accepts: a rotation list, first entry primary.
 *
 * @experimental
 */
export function webhookSecretsFromEnv(env: Readonly<Record<string, string | undefined>>): string[] {
  return (env.BILLING_WEBHOOK_SECRET ?? '').split(',').map(secret => secret.trim()).filter(Boolean)
}
