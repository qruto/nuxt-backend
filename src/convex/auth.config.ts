import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'
import { DEFAULT_AUTH_ROUTE } from './constants'

export interface DefineBackendAuthConfigOptions {
  basePath?: string
  jwks?: string
}

export function defineBackendAuthConfig(options: DefineBackendAuthConfigOptions = {}): AuthConfig {
  return {
    providers: [
      getAuthConfigProvider({
        basePath: options.basePath ?? DEFAULT_AUTH_ROUTE,
        jwks: options.jwks,
      }),
    ],
  }
}

export default defineBackendAuthConfig()
