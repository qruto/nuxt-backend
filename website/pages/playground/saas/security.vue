<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

// The page is the packaged <SecuritySettings> — verification, passkeys,
// sessions and the danger zone, all through usePasskeys/useSessions. The raw
// auth-client calls that used to live here are gone.
</script>

<template>
  <div class="stack bk-depth">
    <PageHeader
      tag="SecuritySettings · usePasskeys · useSessions"
      title="Privacy & security"
    >
      The packaged <code>&lt;SecuritySettings&gt;</code>: email verification,
      the passkeys that sign you in, active sessions on other devices, and the
      confirmed-by-email account deletion flow. Untouched version under
      <NuxtLink to="/playground/vanilla/security">Vanilla</NuxtLink>.
    </PageHeader>

    <LabPanel
      label="webauthn · devices · danger"
      title="Account security"
      tone="accent"
    >
      <SecuritySettings callback-path="/playground/saas/security" />
    </LabPanel>
  </div>
</template>
