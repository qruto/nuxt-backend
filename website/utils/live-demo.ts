// The docs' live demos: a `::demo-*` block is a <DemoBlock> around the live
// part, which renders inside <DeferredBackend> once the backend client has
// loaded (modules/deferred-backend-client). These are the states that block
// goes through and what the frame says about each, and the deployment a
// demo runs against.

/** Where a <DeferredBackend> block stands; see components/DeferredBackend.vue. */
export type DeferredBackendState = 'idle' | 'loading' | 'ready' | 'failed' | 'stale' | 'unavailable'

/** How a demo's frame shows a state: its LED, the word beside it, never the colour alone. */
export const DEMO_STATUS: Record<DeferredBackendState, { tone: 'ok' | 'warn' | 'err' | 'off', word: string }> = {
  idle: { tone: 'off', word: 'Ready' },
  loading: { tone: 'warn', word: 'Connecting' },
  ready: { tone: 'ok', word: 'Live' },
  failed: { tone: 'err', word: 'Offline' },
  stale: { tone: 'err', word: 'Out of date' },
  unavailable: { tone: 'off', word: 'No backend' },
}

/** Host names a deployment on this machine answers at. */
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|[\w.-]+\.localhost)$/

/**
 * The deployment the demos run against, from the site's backend URL: its
 * host, and whether it runs on this machine. A local `pnpm dev` points the
 * site at your own deployment (its URL comes from `.env.local`), so the
 * demos write there, never to the public playground. No URL, or one that
 * does not parse: `undefined`.
 */
export function demoDeployment(url: string | undefined): { host: string, local: boolean } | undefined {
  if (!url) return undefined
  try {
    const { host, hostname } = new URL(url)
    return { host, local: LOOPBACK.test(hostname) }
  }
  catch {
    return undefined
  }
}
