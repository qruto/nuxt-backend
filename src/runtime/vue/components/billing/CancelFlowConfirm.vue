<script setup lang="ts">
import type { CancelFlowConfirmProps } from '../../parts'

/** `<CancelFlow>`'s confirmation, when no offer can stand and "Cancel my plan" ends the plan: what ends when, the button that cancels and "Back". */
defineOptions({ name: 'CancelFlowConfirm' })
const props = defineProps<CancelFlowConfirmProps>()
const { t } = props.flow.labels
</script>

<template>
  <div
    data-cancel-flow="confirm"
    role="group"
    :aria-labelledby="flow.id('title')"
  >
    <p data-cancel-flow="confirm-ends">
      {{ t('confirmEnds') }}
    </p>
    <button
      data-cancel-flow="confirm-cancel"
      type="button"
      v-bind="flow.busy('cancel')"
      @click="flow.cancelNow()"
    >
      {{ flow.running.value === 'cancel' ? t('canceling') : t('confirmCancel') }}
    </button>
    <button
      data-cancel-flow="back"
      type="button"
      @click="flow.back()"
    >
      {{ t('back') }}
    </button>
  </div>
</template>
