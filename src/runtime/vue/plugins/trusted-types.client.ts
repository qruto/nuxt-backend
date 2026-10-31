import { defineNuxtPlugin } from '#imports'
import { installDefaultPolicy } from '../trusted-types'

/**
 * The Trusted Types `default` policy, before any other plugin runs: code
 * that writes a sink without a policy of its own (the head manager's
 * JSON-LD) passes it when what it writes cannot run script
 * (src/runtime/vue/trusted-types.ts).
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:trusted-types',
  enforce: 'pre',
  setup() {
    installDefaultPolicy()
  },
})
