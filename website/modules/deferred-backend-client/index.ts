import { addTypeTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'

// THE BACKEND CLIENT, ONLY WHERE A PAGE USES IT. nuxt-convex-module's client
// plugin builds the Convex client and Better Auth's session store at startup
// on every page: better-auth/vue, its plugins and convex/browser sit in the
// entry chunk, and every docs visit asks for a session. This swaps that
// plugin for one that imports it on demand, in its place in the plugin order:
//
// - before the page renders, on the routes that need the client from the
//   start: /playground/** and the module's pages
//   (`runtimeConfig.public.backend.pages`);
// - on a docs page with `demo: true`, when a <DeferredBackend> block scrolls
//   into view;
// - nowhere else. scripts/check-website-bundle.mjs fails CI when a
//   prerendered page's initial scripts reach the client again.
//
// The server plugin stays: server rendering keeps its client and auth state.

/** nuxt-convex-module's client plugin, wherever the package is installed. */
export const CLIENT_PLUGIN = /nuxt-convex-module\/dist\/runtime\/better-auth\/vue\/plugin\.client(?:\.m?js)?$/

export default defineNuxtModule({
  meta: { name: 'deferred-backend-client' },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    nuxt.hook('app:resolve', (app) => {
      const index = app.plugins.findIndex(plugin => CLIENT_PLUGIN.test(plugin.src.replaceAll('\\', '/')))
      if (index === -1) {
        throw new Error('[deferred-backend-client] nuxt-convex-module\'s client plugin is not in the app: update CLIENT_PLUGIN in website/modules/deferred-backend-client.')
      }
      nuxt.options.alias['#deferred-backend-client/plugin'] = app.plugins[index]!.src
      app.plugins.splice(index, 1, { src: resolve('./runtime/plugin.client'), mode: 'client' })
    })
    addTypeTemplate({
      filename: 'types/deferred-backend-client.d.ts',
      getContents: () => [
        'declare module \'#deferred-backend-client/plugin\' {',
        '  const plugin: import(\'#app\').Plugin',
        '  export default plugin',
        '}',
        'declare module \'#app\' {',
        '  interface NuxtApp {',
        '    /** Load the backend client (once); resolves when its plugin has run. */',
        '    $loadBackendClient: () => Promise<void>',
        '  }',
        '}',
        'export {}',
        '',
      ].join('\n'),
    })
  },
})
