<!-- Live demo on the docs (::demo-counter): a reactive query driven by
     mutations. Reading it is free, so the backend client loads when the
     block scrolls into view; writing needs an account. The page carries
     `demo: true`. -->
<template>
  <DemoBlock
    title="A live counter"
    api="useQuery · useMutation"
    playground="/playground"
  >
    <template #about>
      The number is a query; the keys call mutations. Open this page in a
      second tab and both update together.
    </template>
    <LazyDemoCounterLive />
  </DemoBlock>
</template>
