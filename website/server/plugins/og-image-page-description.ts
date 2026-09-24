import type { H3Event } from 'h3'
import { queryCollection } from '@nuxt/content/server'

// Social cards get their text through the image URL, and Docus squeezes the
// description to fit it: commas dropped, cut to a budget shared with the
// title, and a non-ASCII character anywhere — this site's em dashes —
// switches the encoding to base64, which swells past nuxt-og-image's
// 200-character segment and is truncated. So cards came out with "What
// nuxt-backend is what it provides and how it maps…". This reads the page's
// own description off its collection instead.
//
// Every page renders through the site's plate (the `/**` route rule in
// nuxt.config.ts); Docus's own docs card is listed too, so the swap keeps
// working if a page opts back into it. Docs pages live in the `docs`
// collection, the homepage in `landing`.
//
// The page is found by its card title, not its path: at build time the card
// URL is a hash of the card's options, the page path is not carried on it
// reliably, but the title is — and it is exactly what Docus derives from the
// page (`seo.title` or `title`, cut to 60 characters), so the same derivation
// here matches it back. A cut title is not a key, so the swap happens only
// when exactly one page answers to it; two pages that share their first 60
// characters both keep Docus's own text, which is squeezed but never another
// page's.
const TITLE_LIMIT = 60
const CARDS = new Set(['OgImagePlateTakumi', 'OgImageDocsTakumi'])
const COLLECTIONS = ['docs', 'landing'] as const

interface Page { title?: string, description?: string, seo?: { title?: string, description?: string } }

let pages: Promise<Page[]> | undefined

// Loaded once and shared by every card. A failed load is not kept: the
// next card tries again, and until one succeeds cards keep Docus's text.
function loadPages(e: H3Event) {
  pages ??= Promise.all(COLLECTIONS.map(collection => queryCollection(e, collection)
    .select('title', 'description', 'seo')
    .all(),
  )).then(lists => lists.flat() as Page[], (error: unknown) => {
    pages = undefined
    throw error
  })
  return pages
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('nuxt-og-image:context', async (ctx) => {
    // The component name has been resolved to the registered PascalName.
    if (!CARDS.has(String(ctx.options.component))) return
    const title = ctx.options.props?.title
    if (typeof title !== 'string') return
    const all = await loadPages(ctx.e).catch(() => undefined)
    if (!all) return
    const matches = all.filter(page => (page.seo?.title || page.title)?.slice(0, TITLE_LIMIT) === title)
    if (matches.length !== 1) return
    const description = matches[0]?.seo?.description || matches[0]?.description
    if (description) {
      ctx.options.props = { ...ctx.options.props, description }
    }
  })
})
