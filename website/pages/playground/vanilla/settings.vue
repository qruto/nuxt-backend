<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
// The untouched zero-config look of the packaged <WorkspaceSettings>.
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="zero config"
      title="Vanilla · Settings"
    >
      The neutral look the module auto-mounts at <code>/settings</code>.
      Site-styled version:
      <NuxtLink to="/playground/saas/settings">SaaS demo</NuxtLink>.
    </PageHeader>
    <WorkspaceSettings pricing-path="/playground/vanilla/pricing" />
  </div>
</template>
