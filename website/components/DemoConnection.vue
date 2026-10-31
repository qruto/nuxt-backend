<!-- Live demo on the docs (::demo-connection): this page's own WebSocket
     to the backend, as the connection-state composable reports it. It only
     reads, so the backend client loads when the block scrolls into view;
     the page carries `demo: true`. -->
<template>
  <DemoBlock
    title="This page's connection"
    api="useConnectionState()"
    playground="/playground"
  >
    <template #about>
      The real WebSocket from your browser to the backend, as the composable
      reports it. Turn your network off and on to watch it flip.
    </template>
    <LazyDemoConnectionLive />
  </DemoBlock>
</template>
