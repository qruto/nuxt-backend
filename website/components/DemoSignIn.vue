<!-- Live demo on the docs (::demo-sign-in): the passwordless flow the page
     describes, the login flow against this site's deployment. It signs the
     reader in, so nothing loads until they start it; the page carries
     `demo: true`. -->
<template>
  <DemoBlock
    title="Sign in with a code"
    api="useLoginFlow()"
    playground="/playground/strips"
    load="click"
    start="Start the demo"
  >
    <template #about>
      The flow above, live: pick a test identity, read its code from the
      dev inbox, sign in, and watch what <code class="font-mono">useLoginFlow()</code>
      returns change at every step. Signing in here signs you in to the
      playground too.
    </template>
    <LazyDemoSignInLive />
  </DemoBlock>
</template>
