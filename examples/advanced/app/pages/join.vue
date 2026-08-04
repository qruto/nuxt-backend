<script setup lang="ts">
// CUSTOMIZATION: this app's invitation accept page. Invitation emails link
// here because convex/auth.ts sets `organization.invitationPath: '/join'` and
// nuxt.config.ts sets `backend: { invitationPage: false }` to drop the
// built-in /accept-invitation page. The packaged <AcceptInvitation> component
// still does the heavy lifting — restyled via its slots.
definePageMeta({ middleware: 'auth' })
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
