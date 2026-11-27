<script setup lang="ts">
import { api } from '#backend/api'

// Signed out, the visitor goes to /login?redirect=/account. On a server
// render the middleware asks the deployment, so this page's HTML never
// reaches a signed-out visitor.
definePageMeta({ middleware: 'convex-auth' })

const { data: me } = await useAsyncQuery(api.users.me, {})
const { signOut } = useAuthActions()

async function leave() {
  await signOut()
  await navigateTo('/')
}
</script>

<template>
  <div>
    <h1>Your account</h1>
    <p v-if="me">
      Created {{ new Date(me.createdAt).toLocaleDateString() }}.
    </p>
    <button
      type="button"
      @click="leave"
    >
      Sign out
    </button>
  </div>
</template>
