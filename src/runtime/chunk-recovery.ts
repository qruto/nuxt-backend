// What the chunk-load recovery's two halves share: the inline script a
// production build puts first in each page's head (server/chunk-recovery.ts),
// and the client plugin that tells it the app has mounted
// (vue/plugins/chunk-recovery.client.ts).

/**
 * The window event the client plugin sends once the app has mounted
 * (`app:mounted`). Until then, a failed dynamic import reloads the page;
 * from then on, Nuxt handles it. The page itself cannot say: Vue's
 * `createSSRApp`, which hydrates a server-rendered page, marks nothing in
 * it (only `createApp` sets `data-v-app`).
 */
export const MOUNTED_EVENT = 'nuxt-backend:mounted'
