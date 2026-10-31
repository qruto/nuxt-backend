// Where Panels' own pages live, in one place: the links the backend writes
// (the inbox notification, the ready email, a report in the admin console,
// a share link) and where sign-in lands (nuxt.config.ts) read them here.
// The pages navigate by route name, so app/ names no path at all.
//
// `base` is where app/pages/ is mounted: '' at the root of this app. A host
// that serves the same pages under a prefix (the docs site serves Panels
// under /playground) sets it on this one line, and moves the pages with a
// `pages:extend` hook of its own.
export const base = ''

export const routes = {
  /** The strips page, where sign-in lands. */
  strips: `${base}/strips`,
  /** One strip. */
  strip: (id: string) => `${base}/strips/${id}`,
  /** The public page of a share link: `share` + `/` + the token. */
  share: `${base}/s`,
  /** The first run (app/pages/welcome.vue), in place of the packaged page at the same path. */
  welcome: `${base}/welcome`,
}
