<script setup lang="ts">
// The landing page. The strips page asks a signed-out visitor to sign in
// and brings them back, so both links go there.
const { isSignedIn } = useAuth()
</script>

<template>
  <div class="page">
    <h1>Panels</h1>
    <p>
      Turn an idea and a photo into a three-panel comic strip, drawn by a
      model, and share it by a link anyone can open.
    </p>
    <p>
      <NuxtLink :to="{ name: 'strips' }">
        {{ isSignedIn ? 'Open your strips' : 'Sign in to start a strip' }}
      </NuxtLink>
    </p>
    <p>
      Panels is the app the
      <a href="https://nuxt-backend.dev/docs/start/tutorial">nuxt-backend tutorial</a>
      builds, part by part.
    </p>
  </div>
</template>
