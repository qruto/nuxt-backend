<script setup lang="ts">
const { isAuthenticated } = useAuth()
</script>

<template>
  <main>
    <h1>Minimal example</h1>
    <p class="muted">
      The out-of-the-box <code>nuxt-backend</code> setup: every file in
      <code>convex/</code> is exactly what <code>npx nuxt-backend init</code>
      generates — the only configuration is the required deployment env vars.
      Auth, workspaces with emailed invitations, billing, prepaid credits, and
      gifts all work from here.
    </p>
    <div class="row">
      <NuxtLink
        v-if="isAuthenticated"
        to="/app"
      ><button class="primary">Open the app</button></NuxtLink>
      <NuxtLink
        v-else
        to="/login"
      ><button class="primary">Sign in</button></NuxtLink>
    </div>
  </main>
</template>
