<script setup lang="ts">
import { computed } from 'vue'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { inLocale } from '../../utils/intl'
import { planNames, useUpgradeOffer } from '../../utils/upgrade-offer'
import { SingleRoot } from '../../utils/vnodes'
import type { GateQuotaContext } from './gate'

/**
 * `<Gate quota>`'s refusal when the plan has no room left: how many are
 * used of how many, the plans on sale that allow enough and the way to the
 * first. A component of its own, so the pricing is read only once someone
 * has no room left. The gate's `fallback` slot replaces it.
 *
 * @internal
 */
defineOptions({ name: 'GateQuota' })
const props = withDefaults(defineProps<{
  quota: string
  name: string
  limit: number
  used: number
  amount: number
  labels?: LabelOverrides<BackendLabels['quota']>
}>(), { labels: undefined })
defineSlots<{ fallback: (context: GateQuotaContext) => unknown }>()

const offer = useUpgradeOffer((plan) => {
  // A backend older than plan quotas lists none: it offers no plan then, never fails.
  const limit = plan.quotas && Object.hasOwn(plan.quotas, props.quota) ? plan.quotas[props.quota] : undefined
  return limit === 'unlimited' || (limit ?? 0) >= props.used + props.amount
}, 'Gate')
const { t, locale } = useLabels('quota', () => props.labels)
const count = (value: number) => inLocale(locale.value, tag => new Intl.NumberFormat(tag).format(value))
const context = computed<GateQuotaContext>(() => ({
  quota: props.quota,
  limit: props.limit,
  used: props.used,
  amount: props.amount,
  plans: offer.plans.value,
  plan: offer.plan.value,
  href: offer.href.value,
  canManage: offer.canManage.value,
  isLoading: offer.isLoading.value,
}))
const sentence = computed(() => {
  const ctx = context.value
  const words = [ctx.limit === 0 ? t('notIncluded', { quota: props.name }) : t('reached', { used: count(ctx.used), limit: count(ctx.limit), quota: props.name })]
  // Some room is left, only not enough for what the content needs.
  if (ctx.amount > 1 && ctx.limit > ctx.used) words.push(t('needs', { amount: count(ctx.amount) }))
  if (ctx.plans.length > 0) words.push(t('availableOn', { plans: planNames(ctx.plans, locale.value) }))
  return words.join(' ')
})
</script>

<template>
  <SingleRoot>
    <slot
      name="fallback"
      v-bind="context"
    >
      <div
        data-quota="root"
        :aria-busy="context.isLoading ? 'true' : undefined"
      >
        <!-- A polite status: the plans it names arrive after it shows. -->
        <p
          data-quota="message"
          role="status"
        >
          {{ sentence }}
        </p>
        <a
          v-if="context.canManage && context.href"
          data-quota="action"
          :href="context.href"
        >{{ context.plan ? t('upgrade', { plan: context.plan.name }) : t('seePlans') }}</a>
        <p
          v-else-if="!context.canManage"
          data-quota="note"
        >
          {{ t('askManager') }}
        </p>
      </div>
    </slot>
  </SingleRoot>
</template>
