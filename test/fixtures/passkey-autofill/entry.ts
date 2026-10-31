import { createApp, h, type Component } from 'vue'
import { authClient } from '../../../src/runtime/vue/auth-client'
import AuthForm from '../../../src/runtime/vue/components/auth/AuthForm.vue'

// The passkey autofill page: the packaged <AuthForm> on its own, and the
// auth client for the test to drive the rest (save a passkey, sign out).
// The form finds its parts by registered name, the way an app swaps one, so
// the page registers them, as Nuxt does.
// `window.backend.signedIn` counts the form's `success` events.

const backend = { client: authClient, signedIn: 0 }
;(window as unknown as { backend: typeof backend }).backend = backend

const parts = import.meta.glob<Component>('../../../src/runtime/vue/components/auth/AuthForm?*.vue', { eager: true, import: 'default' })

const app = createApp({
  render: () => h(AuthForm, {
    onSuccess: () => {
      backend.signedIn++
    },
  }),
})
for (const [file, part] of Object.entries(parts)) app.component(file.split('/').pop()!.replace('.vue', ''), part)
app.mount('#app')
