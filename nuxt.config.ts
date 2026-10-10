// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/test-utils',
  ],
  // The published runtime runs inside other people's apps, so it imports
  // everything it uses explicitly (`#imports`, `vue`, `#app`) — an app may
  // turn auto-imports off. With them off in this root app, the one the type
  // check and the `nuxt` test project run in, a runtime file that leans on an
  // auto-import fails `pnpm typecheck` instead of a consumer's build. The
  // Nuxt module starter guards its runtime the same way.
  imports: {
    autoImport: false,
  },
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
})
