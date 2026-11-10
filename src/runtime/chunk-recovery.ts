// What the chunk-load recovery's two halves share: the inline script a
// production build puts first in each page's head (server/chunk-recovery.ts),
// and the client plugin that tells it the app has started
// (vue/plugins/chunk-recovery.client.ts).

/**
 * The window event the client plugin sends once the app has started: its
 * first page rendered in full, hydration included (Nuxt's
 * `app:suspense:resolve`, also on a client-only page and an error page).
 * Until then, a failed chunk reloads the page; from then on, Nuxt handles
 * it. `app:mounted` comes too early: a lazy component of the first page
 * loads its chunk while the page hydrates, after the mount, and until the
 * first render resolves Nuxt's own error handler turns that failure into
 * its error page. The page itself cannot say: Vue's `createSSRApp`, which
 * hydrates a server-rendered page, marks nothing in it (only `createApp`
 * sets `data-v-app`).
 */
export const STARTED_EVENT = 'nuxt-backend:started'
