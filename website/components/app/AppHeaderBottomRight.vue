<script setup lang="ts">
import { PACKAGE_MANAGERS } from '~~/shared/pm'

// Docus 5.15.0's AppHeaderBottomRight (test/docs/docus-copies.test.ts pins
// the source), an empty slot at the right of the tab row, filled: the
// package-manager picker. The ten tabs leave room for one key, so the key
// wears the current manager's mark (CSS picks it off `html[data-pm]`, as it
// picks a block's variant, so it is right before the page hydrates) and
// opens the picker (components/PmChoice.vue). Below lg the row hides and
// the drawer carries the picker (AppHeaderBody.vue).
const id = useId()
const icons = useAppConfig().ui.prose.codeIcon as Record<string, string>
</script>

<template>
  <UPopover
    :content="{ align: 'end', sideOffset: 8 }"
    :ui="{ content: 'plaque p-3' }"
  >
    <button
      type="button"
      class="k k-xs gap-1"
      aria-label="Package manager for commands"
    >
      <UIcon
        v-for="name in PACKAGE_MANAGERS"
        :key="name"
        :name="icons[name]!"
        :data-pm-variant="name"
        class="size-3.5 shrink-0"
        aria-hidden="true"
      />
      <UIcon
        name="i-lucide-chevron-down"
        class="size-3 shrink-0"
        aria-hidden="true"
      />
    </button>

    <template #content>
      <p
        :id="id"
        class="stamp mb-2.5"
      >
        Commands
      </p>
      <PmChoice
        :labelledby="id"
        labels
      />
    </template>
  </UPopover>
</template>
