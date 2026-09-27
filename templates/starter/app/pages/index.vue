<script setup lang="ts">
const { isAuthenticated } = useAuth()
</script>

<template>
  <main>
    <h1>Your app</h1>
    <p class="muted">
      Passwordless sign-in, workspaces with emailed invitations, billing,
      prepaid credits and gifts work from here. Edit this page in
      <code>app/pages/index.vue</code>; your backend functions live in
      <code>backend/</code>.
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
