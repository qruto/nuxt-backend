<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

// The untouched zero-config look of the packaged <ProfileSettings> — the
// playground's test-inbox allowlist still applies (it guards a live Resend
// deployment), plugged in via the same prop a real app would use.
function validateEmail(value: string): boolean | string {
  return isDeliveredTestEmail(value) || TEST_EMAIL_HELP
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="zero config"
      title="Vanilla · Profile"
    >
      The neutral look the module auto-mounts at <code>/profile</code>.
      Site-styled version:
      <NuxtLink to="/playground/saas/profile">SaaS demo</NuxtLink>.
    </PageHeader>
    <ProfileSettings
      :validate-email="validateEmail"
      callback-path="/playground/vanilla/profile"
    />
  </div>
</template>
