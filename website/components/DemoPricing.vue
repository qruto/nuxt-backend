<!-- Live demo on the docs (::demo-pricing): the playground's catalog as the
     pricing read answers it, in this visitor's currency, with the free plan
     every workspace starts on. Reading it is public, so the backend client
     loads when the block scrolls into view. The page carries `demo: true`. -->
<template>
  <DemoBlock
    title="Live prices in your currency"
    api="usePricing()"
    playground="/playground/pricing"
  >
    <template #about>
      The playground's plans, read live as a pricing page reads them: priced
      in your currency where the catalog has it, with the free plan first.
      Switch the currency and every price follows.
    </template>
    <LazyDemoPricingLive />
  </DemoBlock>
</template>
