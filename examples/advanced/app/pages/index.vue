<script setup lang="ts">
const { isAuthenticated } = useAuth()
</script>

<template>
  <main>
    <h1>Advanced example</h1>
    <p class="muted">
      Every <code>nuxt-backend</code> customization point exercised: a locally
      installed (and schema-extended) backend component, a hand-written app
      definition with <code>installBackend</code>, custom email templates,
      custom webhook paths and hooks, explicit billing config, and a custom
      invitation accept page. See the README for the map.
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
