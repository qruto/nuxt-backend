import { fileURLToPath } from 'node:url'
import { DEVTOOLS_UI_LOCAL_PORT, DEVTOOLS_UI_ROUTE } from '../src/devtools/rpc-types'
import { PANEL_PAGES } from './app/nav'
import { SIGNAL_SAFELIST } from './app/utils/signal'

// UnoCSS's icon preset skips its Node loader when it believes it runs inside
// VS Code (`VSCODE_CWD` is set, as in VS Code's integrated terminal), and the
// panel then builds without a single icon. This config only ever runs to build
// or serve the panel, so the flag goes.
delete process.env.VSCODE_CWD

// The DevTools panel app. Served inside the Nuxt DevTools iframe at
// /__nuxt-backend — via sirv from dist/devtools-client in the published
// package, or via the Vite dev proxy (`pnpm dev:devtools-client`) while
// developing this module. The route and port come from the file the module
// reads them from, so the two can't disagree.
export default defineNuxtConfig({
  modules: ['@nuxt/devtools-ui-kit'],
  ssr: false,
  devtools: { enabled: false },
  app: {
    baseURL: DEVTOOLS_UI_ROUTE,
  },
  devServer: {
    port: DEVTOOLS_UI_LOCAL_PORT,
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
        clientPort: DEVTOOLS_UI_LOCAL_PORT,
      },
    },
  },
  telemetry: false,
  // The UI kit's look, minus its brand green: colour here only ever means a
  // signal (green ok, amber warn, red error), so the kit's accents are grey.
  // The signal classes and the nav icons are bound at runtime, which UnoCSS
  // cannot see.
  unocss: {
    theme: {
      colors: {
        brand: '#6b7280',
        primary: '#4b5563',
      },
    },
    safelist: [...SIGNAL_SAFELIST, ...PANEL_PAGES.map(page => page.icon)],
  },
})
