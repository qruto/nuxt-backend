<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
// The untouched zero-config look: the packaged <PricingTable> styled only by
// the module's own ui.css — no site tokens, no overrides.
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="zero config"
      title="Vanilla · Pricing"
    >
      Exactly what ships out of the box — the neutral <code>ui.css</code> look
      the module auto-mounts at <code>/pricing</code>. The site-styled version
      lives under <NuxtLink to="/playground/saas/pricing">SaaS demo</NuxtLink>.
    </PageHeader>
    <PricingTable title="Pricing" />
  </div>
</template>
