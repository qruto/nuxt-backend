<script setup lang="ts">
import PlanChangeConfirmGroup from '../billing/PlanChangeConfirmGroup.vue'
import { closesOnEscape } from '../../utils/confirm-group'
import { useWorkspaceSettingsView } from './workspace-settings'

/**
 * The plan section's switch, while it is open: a select of every price on
 * sale but the plan's own, inside its label, then the plan change's one
 * confirmation for the price picked. Escape closes it and gives focus back
 * to "Change plan".
 *
 * @internal
 */
defineOptions({ name: 'WorkspaceBillingSwitch' })
const view = useWorkspaceSettingsView('WorkspaceBillingSwitch')
const { section } = view
const { t } = view.labels
const escape = closesOnEscape(() => section.closeSwitch())
const pick = (event: Event) => section.pick((event.target as HTMLSelectElement).value)
</script>

<template>
  <div
    v-if="section.switchable.value && section.switchOpen.value"
    :id="view.partId('switch', 'picker')"
    data-settings="switch-picker"
    role="group"
    :aria-labelledby="view.partId('switch', 'title')"
    @keydown="escape"
  >
    <h4
      :id="view.partId('switch', 'title')"
      data-settings="switch-title"
    >
      {{ t('changePlan') }}
    </h4>
    <label data-settings="switch-label">
      {{ t('switchTo') }}
      <select
        data-settings="switch-select"
        :value="section.change.target.value?.productId ?? ''"
        @change="pick"
      >
        <option
          data-settings="switch-option"
          value=""
          disabled
        >
          {{ t('choosePlan') }}
        </option>
        <option
          v-for="option in section.switchOptions.value"
          :key="option.productId"
          data-settings="switch-option"
          :value="option.productId"
        >
          {{ option.plan }} · {{ option.price }}
        </option>
      </select>
    </label>
    <PlanChangeConfirmGroup :confirm="section.change" />
  </div>
</template>
