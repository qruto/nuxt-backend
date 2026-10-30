// pnpm settings this app needs, applied by pnpm itself. npm, Yarn and Bun
// ignore this file.
//
// - pnpm 11 and later stop an install until every dependency build script is
//   approved or denied. This answers for the scripts this app and Nuxt's
//   official modules bring — esbuild, better-sqlite3 (@nuxt/content),
//   unrs-resolver (@nuxt/eslint) and vue-demi (@nuxt/ui) — and the answer is
//   no: esbuild runs from its platform package, Nuxt Content reads SQLite
//   through Node's own `node:sqlite`, and the other two ship what their
//   scripts would build or pick. An answer in your own pnpm settings wins, and
//   any other build script still stops the install.
// - Convex bundles backend/convex.config.ts, which imports the component
//   definitions nuxt-backend brings (`@convex-dev/*/convex.config`). pnpm's
//   isolated node_modules hides those from the app root; hoisting them makes
//   them resolvable, exactly like the installation docs' strict-pnpm setting.
//
// To keep these in plain config instead, delete this file and move them to
// `allowBuilds` and `publicHoistPattern` in a pnpm-workspace.yaml. A template
// can't ship that file: `create nuxt` treats a template that has one as
// pnpm-only.
export const hooks = {
  updateConfig(config) {
    return {
      ...config,
      allowBuilds: {
        'esbuild': false,
        'better-sqlite3': false,
        'unrs-resolver': false,
        'vue-demi': false,
        ...config.allowBuilds,
      },
      publicHoistPattern: [...(config.publicHoistPattern ?? []), '@convex-dev/*'],
    }
  },
}
