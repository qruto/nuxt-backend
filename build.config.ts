export default {
  failOnWarn: false,
  // The CLI ships alongside the module build (dist/cli.mjs → the `nuxt-backend` bin).
  entries: [
    { input: 'src/cli', name: 'cli' },
    // The ESLint preset (dist/eslint.mjs → `nuxt-backend/eslint`).
    { input: 'src/eslint', name: 'eslint' },
  ],
}
