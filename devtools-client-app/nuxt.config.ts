import { fileURLToPath } from 'node:url'

// The DevTools panel app. Served inside the Nuxt DevTools iframe at
// /__nuxt-backend — via sirv from dist/devtools-client in the published
// package, or via the Vite dev proxy (port 3631, `pnpm dev:devtools-client`)
// while developing this module.
export default defineNuxtConfig({
  modules: ['@nuxt/devtools-ui-kit'],
  ssr: false,
  devtools: { enabled: false },
  app: {
    baseURL: '/__nuxt-backend',
  },
  compatibilityDate: 'latest',
  nitro: {
    output: {
      publicDir: fileURLToPath(new URL('../dist/devtools-client', import.meta.url)),
    },
  },
  vite: {
    server: {
      hmr: {
        // The panel is served through the module's Vite proxy, which can't carry
        // the HMR websocket — point the client straight at this app's own port
        // instead. Same fix as nuxt/starter#module-devtools.
        clientPort: Number(process.env.PORT || 3631),
      },
    },
  },
})
