import { useAppConfig } from '#imports'
import { backendAppConfigDefaults, type BackendAppConfig, type BackendAppConfigInput } from '../../config'

/**
 * `appConfig.backend` with the package defaults merged in — the shipped
 * components read content (plan catalog, labels, brand) through this, so a
 * partial user config is always safe to destructure. Reactive via
 * `useAppConfig` (HMR updates flow through).
 */
export function useBackendConfig(): BackendAppConfig {
  const appConfig = useAppConfig() as { backend?: BackendAppConfigInput }
  const user = appConfig.backend
  return {
    billing: {
      plans: user?.billing?.plans ?? backendAppConfigDefaults.billing.plans,
      packs: user?.billing?.packs ?? backendAppConfigDefaults.billing.packs,
    },
    brand: { ...backendAppConfigDefaults.brand, ...user?.brand },
    labels: { ...backendAppConfigDefaults.labels, ...user?.labels },
  } as BackendAppConfig
}
