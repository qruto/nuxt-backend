import type { NuxtApp } from '#app'
import chunkReload from '#deferred-backend-client/chunk-reload'
import clientPlugin from '#deferred-backend-client/plugin'

/**
 * nuxt-convex-module's client plugins, as ./plugin.client.ts loads them on
 * demand (see ../index.ts): its chunk reload plugin, when the app has one,
 * runs first, as the module orders the two in an app that loads them at
 * startup, so a failed load of the auth client is heard from the start.
 * Left at startup, it would keep the auth client's loader in the entry, and
 * the entry would prefetch the client on every page.
 */
export default function runClientPlugins(nuxtApp: NuxtApp): unknown {
  chunkReload?.(nuxtApp)
  return clientPlugin(nuxtApp)
}
