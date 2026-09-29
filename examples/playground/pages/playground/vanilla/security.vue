<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
// The untouched zero-config look of the packaged <SecuritySettings>.
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="zero config"
      title="Vanilla · Security"
    >
      The neutral look the module auto-mounts at <code>/security</code>.
      Site-styled version:
      <NuxtLink to="/playground/saas/security">SaaS demo</NuxtLink>.
    </PageHeader>
    <SecuritySettings callback-path="/playground/vanilla/security" />
  </div>
</template>
