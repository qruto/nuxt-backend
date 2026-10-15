<!-- Live demo on the docs (::demo-connection): the real Convex WebSocket
     state of this page. The backend client loads when the card scrolls into
     view; the page carries `demo: true`. -->
<template>
  <UCard
    variant="subtle"
    class="my-4"
  >
    <DeferredBackend class="flex items-center justify-between gap-4">
      <LazyLiveConnection v-slot="{ connected }">
        <span class="flex items-center gap-2 font-medium">
          <Led
            :tone="connected ? 'ok' : 'err'"
            :pulse="connected"
          />
          {{ connected ? 'Convex live' : 'Offline' }}
        </span>
        <code class="text-xs text-muted">useConnectionState()</code>
      </LazyLiveConnection>
      <template #fallback="{ failed }">
        <span class="flex items-center gap-2 font-medium">
          <Led :tone="failed ? 'err' : 'off'" />
          {{ failed ? 'Offline' : 'Connecting…' }}
        </span>
        <code class="text-xs text-muted">useConnectionState()</code>
      </template>
    </DeferredBackend>
    <p class="mt-2 text-sm text-muted">
      This reflects the real WebSocket connection from your browser to Convex —
      toggle your network to watch it flip live.
    </p>
  </UCard>
</template>
