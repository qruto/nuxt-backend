// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/test-utils',
  ],
  typescript: {
    tsConfig: {
      compilerOptions: {
        // nuxt-module-build reads the generated tsconfig for both declaration
        // builds (rollup-dts for the module entry, mkdist for the runtime
        // tree): `@internal`-tagged declarations never reach the published
        // d.ts files. The component build sets the same flag in
        // tsconfig.convex-component.build.json.
        stripInternal: true,
      },
    },
  },
  // The module's own root app exists for typechecking and the test
  // environment only — no usage analytics from it.
  telemetry: false,
  eslint: {
    config: {
      stylistic: {
        commaDangle: 'only-multiline',
        braceStyle: '1tbs',
      },
    },
  },
})
