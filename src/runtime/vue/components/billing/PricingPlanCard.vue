<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import type { BackendLabels, LabelKey } from '../../composables/use-labels'
import type { PricingPlanCardProps } from '../../parts'
import { VNodes } from '../../utils/vnodes'
import { usePricingView } from './pricing-table'
import PricingPromotion from './PricingPromotion.vue'

/**
 * One plan of `<PricingTable>`: its name, price, what a year saves, its
 * promotion and trial, its features, and its action, which follows the
 * subscription: subscribe (with the trial), switch up or down, switch the
 * billing period, cancel in one step, or keep the plan.
 */
defineOptions({ name: 'PricingPlanCard' })
const props = defineProps<PricingPlanCardProps>()
const view = usePricingView('PricingPlanCard')
const { t } = view.labels
const nameId = computed(() => view.nameId('plan', props.plan.key))
const action = computed(() => view.planAction(props.plan))
const busy = computed(() => props.pricing.pending.value === props.plan.key)
const canceling = computed(() => props.plan.isCurrentPrice && view.context.value.billing.cancelAtPeriodEnd.value)
const period = computed(() => t(`period.${props.plan.interval}` as LabelKey<BackendLabels['pricing']>))
const promotion = computed(() => view.planPromotion(props.plan))
</script>

<template>
  <article
    data-pricing="plan"
    :data-interval="plan.interval"
    :data-current="plan.isCurrent || undefined"
    :data-canceling="canceling || undefined"
    :data-retired="plan.isRetired || undefined"
    :data-free="plan.isFree || undefined"
    :data-trial="view.offersTrial(plan) || undefined"
    :data-highlight="plan.highlight || undefined"
    :data-requested="plan.isRequested || undefined"
    :data-promotion="plan.promotion ? '' : undefined"
    :aria-labelledby="nameId"
  >
    <div
      :id="nameId"
      data-pricing="plan-name"
    >
      {{ plan.name }}<span
        v-if="plan.isCurrent"
        data-pricing="current-badge"
      >{{ t('current') }}</span><span
        v-if="plan.isRetired"
        data-pricing="retired-badge"
      >{{ t('retired') }}</span>
    </div>
    <div data-pricing="plan-price">
      {{ plan.price }}<span data-pricing="plan-period">{{ period }}</span>
    </div>
    <p
      v-if="plan.savings !== undefined"
      data-pricing="plan-savings"
    >
      {{ t('save', { percent: plan.savings }) }}
    </p>
    <PricingPromotion
      v-if="promotion"
      hook="plan-promotion"
      :text="promotion"
    />
    <p
      v-if="view.offersTrial(plan)"
      data-pricing="plan-trial"
    >
      {{ view.trialText(plan.trial!) }}
    </p>
    <p
      v-if="plan.blurb"
      data-pricing="plan-blurb"
    >
      {{ plan.blurb }}
    </p>
    <!-- What a plan unlocks: its credits per cycle, then its features. -->
    <ul data-pricing="plan-features">
      <li
        v-if="plan.credits"
        data-pricing="plan-feature"
        data-feature="credits"
      >
        {{ t(`credits.${plan.interval}` as never, { count: plan.credits.units }) }}
      </li>
      <li
        v-for="feature in plan.features ?? []"
        :key="feature"
        data-pricing="plan-feature"
      >
        {{ feature }}
      </li>
    </ul>
    <VNodes
      v-if="action.kind === 'slot'"
      :nodes="view.slots['plan-action']!({ ...view.context.value, plan }) as never"
    />
    <a
      v-else-if="action.kind === 'sign-in'"
      data-pricing="plan-action"
      data-intent="sign-in"
      :href="action.href"
    >{{ action.text }}</a>
    <p
      v-else-if="action.kind === 'note'"
      :data-pricing="action.hook"
    >
      {{ action.text }}
    </p>
    <template v-else-if="action.kind === 'cancel'">
      <!-- The card names the plan, so a row of the same words reads as one per plan. -->
      <button
        data-pricing="plan-action"
        data-intent="cancel"
        type="button"
        :aria-describedby="nameId"
        v-bind="{ ...busyAttributes(busy), ...view.confirm.toggleProps() }"
      >
        {{ busy ? t('canceling') : t('cancel') }}
      </button>
      <PricingCancelConfirm :pricing="pricing" />
    </template>
    <button
      v-else-if="action.kind === 'button'"
      data-pricing="plan-action"
      :data-intent="action.intent"
      :data-trial="action.trial ? '' : undefined"
      type="button"
      :disabled="action.unavailable"
      :aria-describedby="nameId"
      v-bind="busyAttributes(busy)"
      @click="action.run()"
    >
      {{ busy ? action.busy : action.idle }}
    </button>
  </article>
</template>
