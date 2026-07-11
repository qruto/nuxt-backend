<script setup lang="ts">
const { isAuthenticated } = useAuth()
</script>

<template>
  <main>
    <h1>SaaS starter</h1>
    <p class="muted">
      Everything from <code>nuxt-backend</code>, composed like a real product:
      passwordless auth, workspaces, roles, billing, and live data.
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
