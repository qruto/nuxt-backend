// The one seam every billing provider client is built through: the package's
// own provider calls and the CLI's `billing sync` and `doctor` clients. Each
// points at the provider's own server for its environment (the sandbox or
// production) and nowhere else; development bills in the provider's sandbox.

/** The provider's own environment and the token that reaches it. */
export interface ProviderTarget {
  accessToken: string | undefined
  environment: 'sandbox' | 'production'
}

/** The options a provider client is built with: the provider's server for the environment. */
export function providerClientOptions({ accessToken, environment }: ProviderTarget): { accessToken: string, server: 'sandbox' | 'production' } {
  return { accessToken: accessToken ?? '', server: environment }
}
