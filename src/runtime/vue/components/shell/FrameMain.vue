<script setup lang="ts">
import { computed } from 'vue'
import FrameConnectionStatus from './FrameConnectionStatus.vue'

/**
 * The `<main>` of a packaged page's frame: the page's `h1`, the page, and
 * the status region that closes it (`<ConnectionStatus>` unless the page
 * fills it). Inside `<AppShell>` (`shell`) it is a `<div>` instead, since
 * the shell owns the landmark, the consent dialog and the status.
 *
 * @internal
 */
defineOptions({ name: 'FrameMain' })
const props = withDefaults(defineProps<{ page: string, family: string, title: string, heading: boolean, shell?: boolean }>(), { shell: false })
defineSlots<{ default: () => unknown, status: () => unknown }>()
const family = computed(() => ({ [`data-${props.family}`]: 'page' }))
const titleHook = computed(() => ({ [`data-${props.family}`]: 'title' }))
</script>

<template>
  <div
    v-if="shell"
    :data-backend-page="page"
    v-bind="family"
  >
    <h1
      v-if="heading"
      v-bind="titleHook"
    >
      {{ title }}
    </h1>
    <slot />
  </div>
  <main
    v-else
    :data-backend-page="page"
    v-bind="family"
  >
    <h1
      v-if="heading"
      v-bind="titleHook"
    >
      {{ title }}
    </h1>
    <slot />
    <!-- A required consent waits behind a dialog on every page: the dialog is modal and the storage question fixed, so it sits anywhere in the page. -->
    <ConsentPrompt />
    <div data-backend-region="status">
      <slot name="status">
        <FrameConnectionStatus />
      </slot>
    </div>
  </main>
</template>
