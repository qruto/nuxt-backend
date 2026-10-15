<script setup lang="ts">
import { INSTALL_COMMAND } from '~~/shared/console'

/**
 * The install line, milled into the plate as a `slot-pill`, with a `k-xs`
 * key that copies it: the Quickstart's first command. The line wraps where
 * it does not fit and never clips: it is the page's main call to action,
 * and the closing plate leaves it less room than the hero. The pill is as
 * wide as its line (`inline-flex`), so the closing plate's centred text
 * centres it. The key keeps one width through Copy, Copied and Failed, and
 * a polite status tells a screen reader how the copy went, once.
 */
const { state, copy } = useCopy()
const LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Failed' } as const
const ICON = { idle: 'i-lucide-copy', copied: 'i-lucide-check', failed: 'i-lucide-x' } as const
const SAID = { idle: '', copied: 'Install command copied.', failed: 'Could not copy. Select the command to copy it.' } as const
</script>

<template>
  <div class="slot slot-pill inline-flex max-w-full items-center gap-3 py-1.5 ps-5 pe-1.5">
    <code class="min-w-0 font-mono text-sm wrap-anywhere"><span
      class="text-(--ink-dim) select-none"
      aria-hidden="true"
    >$ </span>{{ INSTALL_COMMAND }}</code>
    <button
      type="button"
      class="k k-xs ms-auto shrink-0"
      :class="{ 'k-err': state === 'failed' }"
      aria-label="Copy the install command"
      @click="copy(INSTALL_COMMAND)"
    >
      <UIcon
        :name="ICON[state]"
        class="size-3.5"
      />
      <span
        class="grid"
        aria-hidden="true"
      >
        <span
          v-for="(text, key) in LABEL"
          :key="key"
          class="[grid-area:1/1]"
          :class="{ invisible: key !== state }"
        >{{ text }}</span>
      </span>
    </button>
    <span
      class="sr-only"
      role="status"
    >{{ SAID[state] }}</span>
  </div>
</template>
