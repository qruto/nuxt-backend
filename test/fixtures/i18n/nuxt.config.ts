import { fileURLToPath } from 'node:url'

// The @nuxtjs/i18n fixture for test/module/registration.test.ts: an app with
// two English locales and a French one, the way @nuxtjs/i18n reads them (from
// the project layer, which a boot's overrides never reach; inline, so the
// config type-checks without the module's types). The module is resolved to
// the source entry, as in the registration fixture.
export default defineNuxtConfig({
  modules: [
    ['@nuxtjs/i18n', {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      locales: [
        { code: 'en', language: 'en-US' },
        { code: 'en-GB', language: 'en-GB' },
        { code: 'fr', language: 'fr-FR' },
      ],
    }],
    'nuxt-backend',
  ],
  alias: {
    'nuxt-backend': fileURLToPath(new URL('../../../src/module.ts', import.meta.url)),
  },
})
