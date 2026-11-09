<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import { closesOnEscape } from '../../utils/confirm-group'
import { PAUSE_MONTHS } from './workspace-billing'
import { useWorkspaceSettingsView } from './workspace-settings'

/**
 * The plan section's pause, while it is open: what a pause does, from the
 * period's end, its length as radios (one to three months), then "Confirm
 * pause" and "Not now". Escape closes it and gives focus back to "Pause plan".
 *
 * @internal
 */
defineOptions({ name: 'WorkspaceBillingPause' })
const view = useWorkspaceSettingsView('WorkspaceBillingPause')
const { section } = view
const { t } = view.labels
const escape = closesOnEscape(() => section.closePause())
/** The day a pause starts on: the period's end, in the reader's words. */
const pauseStarts = computed(() => section.date(view.context.value.billing.subscription.value?.currentPeriodEnd))
/** `true` while the pause is on its way: the button keeps focus and says so. */
const busy = computed(() => view.context.value.pending === 'pause')
</script>

<template>
  <div
    v-if="section.pausable.value && section.pauseOpen.value"
    :id="view.partId('pause', 'confirm')"
    data-settings="pause-confirm"
    role="group"
    :aria-labelledby="view.partId('pause', 'title')"
    @keydown="escape"
  >
    <h4
      :id="view.partId('pause', 'title')"
      data-settings="pause-title"
    >
      {{ t('pauseTitle') }}
    </h4>
    <p data-settings="pause-when">
      {{ pauseStarts ? t('pauseFrom', { date: pauseStarts }) : t('pauseFromPeriod') }}
    </p>
    <fieldset data-settings="pause-lengths">
      <legend data-settings="pause-legend">
        {{ t('pauseFor') }}
      </legend>
      <label
        v-for="months in PAUSE_MONTHS"
        :key="months"
        data-settings="pause-length"
      >
        <input
          v-model="section.pauseMonths.value"
          data-settings="pause-input"
          type="radio"
          :name="view.partId('pause', 'length')"
          :value="months"
        >
        {{ t('pauseMonths', { count: months }) }}
      </label>
    </fieldset>
    <button
      data-settings="confirm-pause"
      type="button"
      v-bind="busyAttributes(busy)"
      @click="busy ? undefined : section.pausePlan(section.pauseMonths.value)"
    >
      {{ busy ? t('pausing') : t('confirmPause') }}
    </button>
    <button
      data-settings="pause-back"
      type="button"
      @click="section.closePause()"
    >
      {{ t('keepCurrent') }}
    </button>
  </div>
</template>
