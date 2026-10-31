<script setup lang="ts">
/**
 * The Access tab's launch phase: the phase now, and a button to move to
 * each other phase the app lists.
 *
 * Internal: a part of `AdminAccess.vue`.
 *
 * @internal
 */
import { computed } from 'vue'
import type { AccessTab } from './admin-access-tab'

const props = defineProps<{ tab: AccessTab }>()
const { id, t, phaseName, movePhase, busy } = props.tab
const data = props.tab.data
const others = computed(() => data.value?.phases.filter(phase => phase !== data.value?.phase) ?? [])
</script>

<template>
  <section
    v-if="data"
    data-admin="access-phase"
    :aria-labelledby="`${id}-phase`"
  >
    <h2 :id="`${id}-phase`">
      {{ t('access.phaseTitle') }}
    </h2>
    <p data-admin="hint">
      {{ t('access.phaseHint') }}
    </p>
    <p
      data-admin="access-current"
      :data-phase="data.phase"
    >
      {{ t('access.phaseCurrent', { phase: phaseName(data.phase) }) }}
    </p>
    <div data-admin="access-phases">
      <button
        v-for="phase in others"
        :key="phase"
        type="button"
        data-admin="access-move"
        :data-phase="phase"
        :aria-disabled="busy(`phase:${phase}`)"
        @click="movePhase(phase)"
      >
        {{ t('access.phaseMove', { phase: phaseName(phase) }) }}
      </button>
    </div>
  </section>
</template>
