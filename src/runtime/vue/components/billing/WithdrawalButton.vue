<script setup lang="ts">
import type { BackendLabels, LabelOverrides } from '../../composables/use-labels'
import { useWithdrawalButton } from './withdrawal-button'

/**
 * The EU withdrawal button (LIFECYCLE; Consumer Rights Directive Art. 11a,
 * from 2026-06-19): "Withdraw from contract here", for a purchase inside its
 * 14 days, then a confirm step, "Confirm withdrawal". The server ends the
 * plan at once and emails a receipt with the date and time; the refund is
 * an administrator's. Nothing renders outside the period, for a member who
 * manages no billing, or while `setupBilling({ lifecycle: { withdrawal } })`
 * is off. Its words are the `withdrawal` labels.
 *
 * @example
 * ```vue
 * <WithdrawalButton />
 * ```
 */
defineOptions({ name: 'WithdrawalButton' })
const props = withDefaults(defineProps<{
  /** Copy for this button, over `appConfig.backend.labels.withdrawal` and the translations. */
  labels?: LabelOverrides<BackendLabels['withdrawal']>
}>(), { labels: undefined })
const emit = defineEmits({
  /** The withdrawal was received, at this time (epoch ms). */
  withdrawn: (_at: number) => true,
  /** It failed: the words the button shows. */
  error: (_message: string) => true,
})
defineSlots<Record<string, never>>()

const withdrawal = useWithdrawalButton({
  labels: () => props.labels,
  onWithdrawn: at => emit('withdrawn', at),
  onError: message => emit('error', message),
})
const { t } = withdrawal.labels
</script>

<template>
  <div
    v-if="withdrawal.period.value || withdrawal.withdrawnAt.value !== null || withdrawal.error.value"
    data-withdrawal="root"
    :data-state="withdrawal.withdrawnAt.value !== null ? 'done' : withdrawal.confirming.value ? 'confirming' : 'idle'"
  >
    <p
      v-if="withdrawal.withdrawnAt.value !== null"
      data-withdrawal="done"
      role="status"
    >
      {{ t('done', { at: withdrawal.text.value.at }) }}
    </p>
    <template v-else-if="withdrawal.period.value">
      <p data-withdrawal="period">
        {{ t('period', { plan: withdrawal.text.value.plan, date: withdrawal.text.value.until }) }}
      </p>
      <button
        v-if="!withdrawal.confirming.value"
        data-withdrawal="button"
        type="button"
        :aria-expanded="false"
        :aria-controls="withdrawal.id('confirm')"
        @click="withdrawal.open()"
      >
        {{ t('button') }}
      </button>
      <div
        v-else
        :id="withdrawal.id('confirm')"
        data-withdrawal="confirm"
        role="group"
        :aria-labelledby="withdrawal.id('title')"
        @keydown.esc.stop="withdrawal.back()"
      >
        <p
          :id="withdrawal.id('title')"
          data-withdrawal="confirm-title"
        >
          {{ t('confirmTitle', { plan: withdrawal.text.value.plan }) }}
        </p>
        <p data-withdrawal="confirm-text">
          {{ t('confirmText') }}
        </p>
        <div data-withdrawal="actions">
          <button
            data-withdrawal="confirm-button"
            type="button"
            v-bind="withdrawal.busy()"
            @click="withdrawal.confirm()"
          >
            {{ withdrawal.isPending.value ? t('confirming') : t('confirm') }}
          </button>
          <button
            data-withdrawal="back"
            type="button"
            @click="withdrawal.back()"
          >
            {{ t('back') }}
          </button>
        </div>
      </div>
    </template>
    <p
      v-if="withdrawal.error.value"
      data-withdrawal="error"
      role="alert"
    >
      {{ withdrawal.error.value }}
    </p>
  </div>
</template>
