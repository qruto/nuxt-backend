import type { ConvexLogger } from '../../src/runtime/vue/client'

/**
 * A logger for tests that point a client at an intentionally unreachable
 * address.
 *
 * The convex client emits all of its connection chatter — "WebSocket error
 * message: ...", reconnect attempts, etc. — at `log` / `logVerbose` level (see
 * `convex/browser/sync/web_socket_manager`). This logger drops those two levels
 * so they don't leak into test output, while still forwarding `warn` and
 * `error` to the console. Keeping `warn`/`error` matters: some tests assert that
 * the client warns (e.g. when an optimistic update handler returns a Promise),
 * and those must still reach the `console.warn` spy.
 */
export const silentConnectLogger: ConvexLogger = {
  logVerbose: () => {},
  log: () => {},
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
}
