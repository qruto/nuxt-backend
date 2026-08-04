<script setup lang="ts">
// <AuthForm> is the packaged passwordless flow (passkeys + email OTP);
// nuxt-backend/auth.css (see nuxt.config.ts) provides the neutral styling.
</script>

<template>
  <main>
    <AuthForm
      title="Sign in"
      @success="navigateTo('/app')"
    />
  </main>
</template>
