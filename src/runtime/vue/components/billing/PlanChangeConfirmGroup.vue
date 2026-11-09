<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import { confirmGroup } from '../../utils/confirm-group'
import type { PlanChangeConfirm } from '../../utils/plan-change-confirm'

/**
 * A plan change's confirmation, while it is open: the price the plan moves
 * to, when the switch happens and how the period's difference is settled,
 * then the one button that switches and one that leaves it. Escape closes
 * it and gives focus back to the button that opened it.
 *
 * @internal
 */
defineOptions({ name: 'PlanChangeConfirmGroup' })
const props = defineProps<{ confirm: PlanChangeConfirm }>()
const options = computed(() => props.confirm.options)
const { hook, busy, keydown } = confirmGroup(() => options.value, () => props.confirm.close())
</script>

<template>
  <div
    v-if="confirm.target.value && confirm.preview.value"
    :id="options.partId('confirm')"
    v-bind="hook('change-confirm')"
    role="group"
    data-state="open"
    :data-applies="confirm.preview.value.applies"
    :aria-labelledby="options.partId('title')"
    @keydown="keydown"
  >
    <component
      :is="options.titleTag"
      :id="options.partId('title')"
      v-bind="hook('change-title')"
    >
      {{ options.t('changeTitle', { plan: confirm.target.value.plan }) }}
    </component>
    <p v-bind="hook('change-when')">
      {{ confirm.when.value }}
    </p>
    <button
      v-bind="{ ...hook('confirm-change'), ...busyAttributes(busy()) }"
      type="button"
      @click="busy() ? undefined : options.confirm(confirm.target.value)"
    >
      {{ busy() ? options.t('switchingPlan') : options.t('confirmChange') }}
    </button>
    <button
      v-bind="hook('change-back')"
      type="button"
      :aria-disabled="busy() ? 'true' : undefined"
      @click="confirm.close()"
    >
      {{ options.t('keepCurrent') }}
    </button>
  </div>
</template>
