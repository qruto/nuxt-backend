export default {
  // The build has three steps (package.json `build`): this one, then
  // scripts/normalize-module-ext.js renames its `.mjs`/`.d.mts` output to the
  // `.js`/`.d.ts` names the exports map uses, then the Convex component build
  // writes `dist/convex/`. unbuild checks the exports map at the end of this
  // first step, before either has run, and warns about every one of those
  // paths ("Potential missing package.json files") — warnings by
  // construction, so they must not fail the build. What the finished build
  // ships is checked by `pnpm check:tarball` instead: publint, attw and the
  // required-file list.
  failOnWarn: false,
  // The CLI ships alongside the module build (dist/cli.mjs → the `nuxt-backend` bin).
  entries: [
    { input: 'src/cli', name: 'cli' },
    // The ESLint preset (dist/eslint.mjs → `nuxt-backend/eslint`).
    { input: 'src/eslint', name: 'eslint' },
  ],
}
