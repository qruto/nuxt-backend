import { fileURLToPath } from 'node:url'
import { addComponent, defineNuxtModule } from '@nuxt/kit'
import { lazily } from '../../../src/nuxt/registry'

// Build fixture for test/e2e/lazy-component.test.ts: one heavy component,
// registered the way the package registers one (`lazily`, from
// src/nuxt/registry.ts), and a page that renders it. The test builds the app
// and reads where the component's code went.
export default defineNuxtConfig({
  modules: [
    defineNuxtModule({
      meta: { name: 'lazy-probe' },
      setup() {
        addComponent(lazily({
          name: 'HeavyProbe',
          export: 'HeavyProbe',
          filePath: fileURLToPath(new URL('./probe/heavy-probe.ts', import.meta.url)),
        }))
      },
    }),
  ],
  devtools: { enabled: false },
  compatibilityDate: '2026-10-01',
  telemetry: false,
})
