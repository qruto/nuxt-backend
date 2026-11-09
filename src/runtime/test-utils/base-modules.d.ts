// The base module's own client entry under the private name
// backendTestAliases() gives it (./aliases.ts), so the aliased modules
// (./client.ts, ./install.ts) can import the real entry they stand in for
// without importing themselves. Declared here, beside them, so the
// declaration ships with them: an app's type check reads them as written
// (the website's reads src/runtime, which dist/runtime links to after
// dev:prepare). Each file that imports it references this file, so a
// program that reaches it through imports alone, not a glob of this
// directory, loads it too.

declare module '#backend-test-utils/base-client' {
  export * from 'nuxt-convex-module/client'
}
