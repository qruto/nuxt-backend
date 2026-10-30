<script setup lang="ts">
import type { PageTurnLabels, PageTurns } from '../../utils/page-turns'

/**
 * The newer and older buttons of a paged list, hooked on its family. A
 * pressed button is busy while its page loads: `aria-disabled` rather than
 * `disabled`, so it keeps focus, saying so, and a second press of either
 * does nothing. `disabled` stays for a direction with no page left. Nothing
 * while there is a single page.
 *
 * @internal
 */
defineOptions({ name: 'ListPager' })
const props = defineProps<{ pages: PageTurns, labels: PageTurnLabels }>()
const hook = (value: string) => ({ [`data-${props.pages.family}`]: value })
const root = props.pages.root
</script>

<template>
  <div
    v-if="pages.list.hasMore.value || pages.list.hasPrevious.value"
    ref="root"
    v-bind="hook('pager')"
  >
    <button
      v-bind="hook('newer')"
      type="button"
      :disabled="!pages.list.hasPrevious.value"
      :aria-disabled="pages.busy() ? 'true' : undefined"
      :data-state="pages.turning.value === 'newer' ? 'pending' : 'idle'"
      @click="pages.turn('newer')"
    >
      {{ pages.turning.value === 'newer' ? labels.loading : labels.newer }}
    </button>
    <button
      v-bind="hook('older')"
      type="button"
      :disabled="!pages.list.hasMore.value"
      :aria-disabled="pages.busy() ? 'true' : undefined"
      :data-state="pages.turning.value === 'older' ? 'pending' : 'idle'"
      @click="pages.turn('older')"
    >
      {{ pages.turning.value === 'older' ? labels.loading : labels.older }}
    </button>
  </div>
</template>
