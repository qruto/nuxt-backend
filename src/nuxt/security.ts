import type { Nuxt } from '@nuxt/schema'
import { TRUSTED_TYPES_POLICIES } from '../runtime/vue/trusted-types'

/**
 * What the package asks of `nuxt-security`, under the app's own options
 * (the app's `security` config wins key by key, `false` included):
 *
 * - a nonce on every script and style the server renders (`nonce: true`,
 *   nuxt-security's own default, said here so the policy below never runs
 *   without it), which the default `script-src` trusts with
 *   `'strict-dynamic'`;
 * - `worker-src 'self'` and `manifest-src 'self'`: the web push worker and
 *   the web app manifest the module serves are the app's own, so
 *   registering them never depends on how a browser reads the policy's
 *   fallback;
 * - Trusted Types, in a production build: `require-trusted-types-for
 *   'script'`, with the policies the package creates (`vue`, `nuxt-backend`
 *   and the narrow `default`, src/runtime/vue/trusted-types.ts). Not in
 *   development, where Vite's error overlay writes markup no policy passes.
 *
 * An app that loads code which writes sinks itself lists that code's policy
 * in `trusted-types`, or turns the requirement off with
 * `'require-trusted-types-for': false`.
 */
export function securityDefaults(dev: boolean): Record<string, unknown> {
  const own = { 'worker-src': ['\'self\''], 'manifest-src': ['\'self\''] }
  return {
    nonce: true,
    headers: {
      contentSecurityPolicy: dev
        ? own
        : {
            ...own,
            'require-trusted-types-for': '\'script\'',
            'trusted-types': [...TRUSTED_TYPES_POLICIES],
          },
    },
  }
}

/**
 * Whether the app set `security: false` (nuxt-security's own switch): the
 * package then installs no nuxt-security and adds no Trusted Types plugin.
 * Nuxt 4.6 types the resolved option as the module's options object, but the
 * value is still whatever nuxt.config wrote.
 */
export function securityDisabled(nuxt: Pick<Nuxt, 'options'>): boolean {
  return (nuxt.options.security as unknown) === false
}
