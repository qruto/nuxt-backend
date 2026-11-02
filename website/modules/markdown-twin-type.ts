import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineNuxtModule, useLogger } from '@nuxt/kit'
import { untypePageHeaderRoutes, type VercelRoute } from '../shared/vercel'

// Markdown twins typed as Markdown on Vercel, for a page asked for without
// its trailing slash too (shared/vercel.ts, untypePageHeaderRoutes). The
// routes are in the build's config.json once Nitro has compiled. A Vercel
// build with no page route to untype fails: nuxt-security has stopped
// exporting them, or exports them in another shape, and this module is
// either moot or blind.
export default defineNuxtModule({
  meta: { name: 'markdown-twin-type' },
  setup(_options, nuxt) {
    nuxt.hook('nitro:init', (nitro) => {
      if (nitro.options.dev || !nitro.options.preset.includes('vercel')) return
      nitro.hooks.hook('compiled', async () => {
        const file = resolve(nitro.options.output.dir, 'config.json')
        const config = JSON.parse(await readFile(file, 'utf8')) as { routes: VercelRoute[] }
        const untyped = untypePageHeaderRoutes(config.routes)
        if (!untyped) throw new Error(`markdown-twin-type: ${file} has no page header route with a Content-Type`)
        await writeFile(file, JSON.stringify(config, null, 2), 'utf8')
        useLogger('markdown-twin-type').info(`took Content-Type off ${untyped} page header routes`)
      })
    })
  },
})
