<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../../composables/use-auth'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { planNames, useUpgradeOffer } from '../../utils/upgrade-offer'
import { SingleRoot } from '../../utils/vnodes'
import { coolingDown, coolDown, type UpgradePromptSlotContext, type UpgradePromptSlots } from './upgrade-prompt'

/**
 * What someone whose plan lacks a feature sees: a sentence naming the plans
 * on sale that include it, in pricing order, and a link to the first of
 * them on the pricing page (`/pricing?plan=<key>`). The plans come from the
 * catalog (`usePricing`, by each plan's `featureKeys`), so the prompt offers
 * exactly the plans the server's `requireFeature` names; a
 * `feature_required` refusal's own `plans` can be handed over as they are.
 * A workspace member who manages none of its billing gets no link, and is
 * asked to ask an owner or admin instead.
 *
 * The `fallback` of `<Gate feature>`: the gate decides whether the feature
 * is there, the prompt says how to get it. `data-upgrade` attributes for
 * styling, slots for every region, and its copy from the `upgrade` labels.
 *
 * With `cooldown` (ms) it offers "Not now", and once dismissed stays hidden
 * that long, per feature for the signed-in person, kept in this browser.
 * Only the prompt waits: the gate stays locked, and the server still
 * refuses with `feature_required`. A prompt without `cooldown`, such as one
 * shown for a refusal of a click the person made, always shows.
 *
 * @example
 * ```vue
 * <Gate feature="reports">
 *   <ReportsPanel />
 *   <template #fallback><UpgradePrompt feature="reports" /></template>
 * </Gate>
 * ```
 */
defineOptions({ name: 'UpgradePrompt' })

const props = withDefaults(defineProps<{
  /** The feature to unlock, by its catalog key: the prompt offers the plans on sale that include it. */
  feature?: string
  /**
   * The plans to offer instead, by catalog key, such as a `feature_required`
   * refusal's `data.plans`. Shown in pricing order, and only while on sale.
   */
  plans?: string[]
  /** Copy for this prompt, over `appConfig.backend.labels.upgrade` and the translations. */
  labels?: LabelOverrides<BackendLabels['upgrade']>
  /**
   * How long the prompt stays hidden after "Not now", in milliseconds: it
   * offers the dismiss only with one. Counted per feature (or per the
   * `plans` named) for the signed-in person.
   */
  cooldown?: number
}>(), { feature: undefined, plans: undefined, labels: undefined, cooldown: undefined })
const emit = defineEmits({
  /** "Not now": the prompt hides for `cooldown`. */
  dismissed: () => true,
})
defineSlots<UpgradePromptSlots>()

// The plans on sale that include the feature (or the ones named), in the
// pricing's own order. A pricing that could not be read offers none: the
// action still opens the pricing page.
const offer = useUpgradeOffer((plan) => {
  if (props.plans) return props.plans.includes(plan.key)
  // A backend older than the app answers no keys: it offers no plan then, never fails.
  return props.feature !== undefined && props.feature !== '' && (plan.featureKeys as string[] | undefined)?.includes(props.feature) === true
}, 'UpgradePrompt')
const { t, locale } = useLabels('upgrade', () => props.labels)
const auth = useAuth()
/** What the cool-down is kept under: the person, and the feature or the plans offered. */
const coolKey = () => `${auth.user.value?.id ?? 'visitor'}:${props.feature ?? props.plans?.join(',') ?? ''}`
// Read in the browser only: with a cool-down the prompt waits for it, so it never flashes before hiding.
const cooled = ref(props.cooldown !== undefined)
onMounted(() => {
  cooled.value = props.cooldown !== undefined && coolingDown(coolKey(), props.cooldown)
})
function dismiss(): void {
  coolDown(coolKey())
  cooled.value = true
  emit('dismissed')
}
const context = computed<UpgradePromptSlotContext>(() => ({
  feature: props.feature,
  plans: offer.plans.value,
  plan: offer.plan.value,
  href: offer.href.value,
  canManage: offer.canManage.value,
  isLoading: offer.isLoading.value,
}))
</script>

<template>
  <SingleRoot v-if="!cooled">
    <slot v-bind="context">
      <div
        data-upgrade="root"
        :aria-busy="context.isLoading ? 'true' : undefined"
        :data-loading="context.isLoading ? '' : undefined"
      >
        <slot
          name="message"
          v-bind="context"
        >
          <!-- A polite status: the plans it names arrive after it shows. -->
          <p
            data-upgrade="message"
            role="status"
          >
            {{ t('message') }}<template v-if="context.plans.length > 0">
              {{ ' ' }}{{ t('availableOn', { plans: planNames(context.plans, locale) }) }}
            </template>
          </p>
        </slot>
        <template v-if="context.canManage && context.href">
          <slot
            name="action"
            v-bind="context"
          >
            <a
              data-upgrade="action"
              :href="context.href"
            >{{ context.plan ? t('upgrade', { plan: context.plan.name }) : t('seePlans') }}</a>
          </slot>
        </template>
        <p
          v-else-if="!context.canManage"
          data-upgrade="note"
        >
          {{ t('askManager') }}
        </p>
        <button
          v-if="cooldown !== undefined"
          data-upgrade="dismiss"
          type="button"
          @click="dismiss"
        >
          {{ t('dismiss') }}
        </button>
      </div>
    </slot>
  </SingleRoot>
</template>
