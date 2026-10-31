<script setup lang="ts">
/**
 * The live half of ::demo-connection: the connection state this page's
 * client reports, as a light with its word and as the object
 * useConnectionState() returns. It renders only inside <DemoBlock>, once the
 * backend client has loaded. A socket that has not come up yet is
 * "Connecting", not an outage.
 */
const connection = useConnectionState()
const status = computed(() => connection.value.isWebSocketConnected
  ? 'live'
  : connection.value.hasEverConnected ? 'offline' : 'connecting')

// The same lights as the frame's: amber while connecting.
const LIGHT = { live: 'ok', offline: 'err', connecting: 'warn' } as const
const WORD = { live: 'Connected', offline: 'Offline', connecting: 'Connecting' } as const
</script>

<template>
  <div class="grid gap-3">
    <p
      class="m-0 flex items-center gap-2 text-sm font-semibold text-(--ink)"
      aria-live="polite"
    >
      <Led
        :tone="LIGHT[status]"
        :pulse="status === 'live'"
      />
      {{ WORD[status] }}
    </p>
    <StateReadout
      label="useConnectionState()"
      :value="connection"
      :tone="status === 'offline' ? 'err' : 'neutral'"
    />
  </div>
</template>
