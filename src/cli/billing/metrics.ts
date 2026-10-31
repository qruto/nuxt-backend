import { Polar } from '@polar-sh/sdk'
import { metricsLimits } from '@polar-sh/sdk/funcs/metricsLimits.js'
import { providerClientOptions } from '../../convex/integrations/billing/provider-client'
import { finding, type PreflightFinding } from '../../findings'
import type { Environment } from './provider'

// --- doctor: the analytics capability's one provider check ---

/**
 * Whether the billing access token reads the provider's metrics, which the
 * admin console's Revenue view asks for: a read of the metrics' date
 * limits, which takes the `metrics:read` scope and nothing else. No token
 * here is `billing-access`'s finding, so this one says nothing then.
 *
 * @internal
 */
export async function metricsAccessFindings(options: { accessToken: string | undefined, environment: Environment }, client?: Polar): Promise<PreflightFinding[]> {
  if (!options.accessToken) return []
  const polar = client ?? new Polar(providerClientOptions({ accessToken: options.accessToken, environment: options.environment }))
  const read = await metricsLimits(polar).catch((error: unknown) => ({ ok: false as const, error }))
  if (read.ok) return [finding('analytics-metrics', 'pass', 'BILLING_ACCESS_TOKEN reads the provider\'s metrics (metrics:read): the admin console\'s Revenue view can open.')]
  const status = (read.error as { statusCode?: unknown } | null)?.statusCode
  if (status === 401 || status === 403) {
    return [finding(
      'analytics-metrics',
      'warn',
      'BILLING_ACCESS_TOKEN lacks the metrics:read scope: the admin console\'s Revenue view is refused as unavailable.',
      'Issue a new organization access token with the metrics:read scope (besides the ones it has), put it in .env.local, and run `npx nuxt-backend env push`.',
    )]
  }
  return [finding(
    'analytics-metrics',
    'warn',
    'The billing provider did not answer a metrics read with BILLING_ACCESS_TOKEN (unreachable, or the token is expired or for the other environment): the Revenue view would be refused as unavailable.',
    'Check the token is current and issued for the billing environment BACKEND_ENVIRONMENT names (the provider sandbox unless it is production), then run `npx nuxt-backend doctor --only analytics` again.',
  )]
}
