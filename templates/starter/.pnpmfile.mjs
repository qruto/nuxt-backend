// pnpm settings this app needs, applied by pnpm itself. npm, Yarn and Bun
// ignore this file.
//
// - esbuild has the only dependency build script in this app. pnpm 11 and
//   later stop the first install until every build script is approved, so this
//   approves it; a decision about esbuild in your own pnpm settings wins.
// - Convex bundles backend/convex.config.ts, which imports the component
//   definitions nuxt-backend brings (`@convex-dev/*/convex.config`). pnpm's
//   isolated node_modules hides those from the app root; hoisting them makes
//   them resolvable, exactly like the installation docs' strict-pnpm setting.
//
// To keep these in plain config instead, delete this file and put
// `allowBuilds: { esbuild: true }` and `publicHoistPattern: ['@convex-dev/*']`
// in a pnpm-workspace.yaml. A template can't ship that file: `create nuxt`
// treats a template that has one as pnpm-only.
export const hooks = {
  updateConfig(config) {
    return {
      ...config,
      allowBuilds: { esbuild: true, ...config.allowBuilds },
      publicHoistPattern: [...(config.publicHoistPattern ?? []), '@convex-dev/*'],
    }
  },
}
