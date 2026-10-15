<!-- Live demo on the docs (::demo-counter): a reactive Convex query driven
     by mutations. The backend client loads when the card scrolls into view;
     the page carries `demo: true`. -->
<template>
  <UCard
    variant="subtle"
    class="my-4"
  >
    <DeferredBackend>
      <LazyDemoCounterLive />
      <template #fallback="{ failed }">
        <p class="text-sm text-muted">
          {{ failed ? 'The live counter could not load. Reload the page to try again.' : 'Loading the live counter…' }}
        </p>
      </template>
    </DeferredBackend>
  </UCard>
</template>
