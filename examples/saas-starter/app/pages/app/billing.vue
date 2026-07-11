<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { current } = useOrganization()
const billing = useBilling()
const features = useFeatures()
const credits = useCredits()
</script>

<template>
  <main>
    <nav>
      <NuxtLink to="/app">← Back</NuxtLink>
      <span class="spacer" />
      <span class="muted">Workspace: {{ current?.name }}</span>
    </nav>

    <section>
      <h2>Plan</h2>
      <p class="muted">
        {{ billing.isLoading.value ? 'Loading…'
          : billing.isSubscribed.value ? 'Subscribed — thanks!' : 'On the free plan.' }}
      </p>
      <div class="row">
        <!-- Configure products in billing.ts / Polar, then pass their ids. -->
        <CheckoutLink
          v-if="!billing.isSubscribed.value"
          :product-ids="[]"
          class="primary"
        >
          Upgrade
        </CheckoutLink>
        <CustomerPortalLink v-else>
          Manage subscription
        </CustomerPortalLink>
      </div>
      <p class="muted">
        Feature gate demo: premium is {{ features.has('premium') ? 'unlocked' : 'locked' }}.
        Credits balance: {{ credits.balance.value ?? 0 }}.
      </p>
    </section>
  </main>
</template>
