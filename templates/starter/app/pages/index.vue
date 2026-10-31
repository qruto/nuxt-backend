<script setup lang="ts">
const { isSignedIn } = useAuth()
</script>

<template>
  <div class="page">
    <h1>Your app</h1>
    <p class="muted">
      Passwordless sign-in, workspaces with emailed invitations, billing,
      prepaid credits and gifts work from here. Edit this page in
      <code>app/pages/index.vue</code>; your backend functions live in
      <code>backend/</code>.
    </p>
    <div class="row">
      <NuxtLink
        v-if="isSignedIn"
        to="/app"
      ><button class="primary">Open the app</button></NuxtLink>
      <NuxtLink
        v-else
        to="/login"
      ><button class="primary">Sign in</button></NuxtLink>
    </div>
  </div>
</template>
