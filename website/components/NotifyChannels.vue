<script setup lang="ts">
// Where "your strip is ready" reaches you: each channel the kind allows, on
// or off, and web push on this device. useEmailPreferences reads the
// person's channels live; usePushSubscription asks the browser.
const { channels, set, isPending, error } = useEmailPreferences()
const push = usePushSubscription()

const KIND = 'app.strip_ready'
const names: Record<string, string> = { app: 'In the app', email: 'By email', push: 'On this device' }
const ready = computed(() => channels.value.find(choice => choice.type === KIND))
</script>

<template>
  <section aria-labelledby="channels-heading">
    <h2 id="channels-heading">
      When a strip is ready
    </h2>
    <fieldset v-if="ready">
      <legend>Tell me</legend>
      <label
        v-for="choice in ready.channels"
        :key="choice.channel"
        class="row"
      >
        <input
          type="checkbox"
          :checked="choice.enabled"
          :disabled="isPending"
          @change="set({ kind: KIND, channel: choice.channel }, ($event.target as HTMLInputElement).checked)"
        >
        {{ names[choice.channel] ?? choice.channel }}
      </label>
    </fieldset>
    <template v-if="push.isSupported.value">
      <p v-if="push.needsInstall.value">
        Add Panels to your home screen first: this browser sends notifications to installed apps only.
      </p>
      <button
        v-else-if="push.isSubscribed.value"
        type="button"
        :aria-disabled="push.isPending.value || undefined"
        @click="push.isPending.value || push.unsubscribe()"
      >
        Stop notifications on this device
      </button>
      <button
        v-else
        type="button"
        :aria-disabled="push.isPending.value || undefined"
        @click="push.isPending.value || push.subscribe()"
      >
        Send notifications to this device
      </button>
    </template>
    <p
      v-if="error || push.error.value"
      role="alert"
    >
      {{ (error ?? push.error.value)?.message }}
    </p>
  </section>
</template>
