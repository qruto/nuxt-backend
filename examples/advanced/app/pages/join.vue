<script setup lang="ts">
// CUSTOMIZATION: this app's invitation accept page. Invitation emails link
// here because nuxt.config.ts moves the built-in page to /join, which the
// module carries to backend/paths.generated.ts, and this page replaces it
// there (an app page always wins). The packaged <AcceptInvitation> component
// still does the heavy lifting — restyled via its slots.
definePageMeta({ auth: true })
</script>

<template>
  <main>
    <h1>You've been invited 💌</h1>
    <AcceptInvitation @accepted="navigateTo('/app')">
      <template #accepted>
        <p>Welcome aboard — taking you to the app…</p>
      </template>
    </AcceptInvitation>
  </main>
</template>
