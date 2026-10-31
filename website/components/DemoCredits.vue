<!-- Live demo on the docs (::demo-credits): this visitor's credit balance
     and the plan that grants it, the free plan to start with. Reading it is
     free, so the backend client loads when the block scrolls into view;
     the balance is a workspace's, so it needs an account. The page carries
     `demo: true`. -->
<template>
  <DemoBlock
    title="Your credits, live"
    api="useCredits() · useBilling()"
    playground="/playground/pricing"
  >
    <template #about>
      Your workspace's balance as the provider grants it: every new workspace
      starts on the free plan, which credits it every month, and a plan or a
      pack adds more.
    </template>
    <LazyDemoCreditsLive />
  </DemoBlock>
</template>
