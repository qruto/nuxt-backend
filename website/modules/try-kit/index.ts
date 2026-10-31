import { addPlugin, addServerHandler, createResolver, defineNuxtModule } from '@nuxt/kit'
import { NOTES_ROUTE } from './runtime/route'

// THE TRY KIT'S REVIEW NOTES, IN DEVELOPMENT ONLY. While the maintainer
// clicks through the playground and the docs (`pnpm try`), pressing N on a
// page leaves a note about it, and the element under the pointer, in
// `.review/notes.jsonl` at the repository root (gitignored); `pnpm
// try:notes` exports them as Markdown by page.
//
// A production build never sees any of it: the module stops here outside
// `nuxt dev`, so neither the overlay nor the endpoint reaches the site's
// bundles, and the endpoint refuses on its own outside a dev server too. It
// lives in the website, never in the package an app installs.

export default defineNuxtModule({
  meta: { name: 'try-kit' },
  setup(_options, nuxt) {
    if (!nuxt.options.dev) return
    const { resolve } = createResolver(import.meta.url)
    // `origin`: where `pnpm try` serves the app (NUXT_TRY_KIT_ORIGIN), from which notes come too.
    const tryKit: { notesFile: string, origin: string } = { notesFile: resolve('../../../.review/notes.jsonl'), origin: '' }
    Object.assign(nuxt.options.runtimeConfig, { tryKit })
    addServerHandler({ route: NOTES_ROUTE, method: 'post', handler: resolve('./runtime/notes-handler') })
    addPlugin({ src: resolve('./runtime/review-notes.client'), mode: 'client' })
  },
})
