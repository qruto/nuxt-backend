<script setup lang="ts">
import type { CancelFlowEndProps } from '../../parts'

/** `<CancelFlow>`'s end: when the plan ends, what keeps working until then, and "Keep my plan"; or that the plan stays. */
defineOptions({ name: 'CancelFlowEnd' })
const props = defineProps<CancelFlowEndProps>()
const { t } = props.flow.labels
</script>

<template>
  <div
    data-cancel-flow="end"
    :data-state="flow.step.value"
  >
    <template v-if="flow.step.value === 'kept'">
      <p
        data-cancel-flow="kept"
        role="status"
      >
        {{ t('kept') }}
      </p>
    </template>
    <template v-else>
      <p
        data-cancel-flow="ends"
        role="status"
      >
        {{ flow.endText.value }}
      </p>
      <p data-cancel-flow="end-note">
        {{ t('endNote') }}
      </p>
      <button
        data-cancel-flow="keep"
        type="button"
        v-bind="flow.busy('keep')"
        @click="flow.keep()"
      >
        {{ flow.running.value === 'keep' ? t('keeping') : t('keep') }}
      </button>
    </template>
  </div>
</template>
