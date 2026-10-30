<script setup lang="ts">
import { computed, h, nextTick, ref, type Ref } from 'vue'
import { backendAppConfigDefaults } from '../../../config'
import { busyAttributes } from '../../a11y'
import { useBackendConfig } from '../../composables/use-backend-config'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useBilling } from '../../composables/use-billing'
import { useCredits } from '../../composables/use-credits'
import { refusalText, useLabels } from '../../composables/use-labels'
import { usePricing } from '../../composables/use-pricing'
import { holdsFocus, returnFocus } from '../../utils/focus-return'
import { VNodes } from '../../utils/vnodes'
import { type LowCreditsNoticeContext, turnedOff } from './notices'

/**
 * `<BackendNotices>`' running-low nudge: appears once the prepaid credit
 * balance drops under the threshold (`appConfig.backend.billing.lowCreditsThreshold`,
 * or the notices' `threshold`), and offers the way back to more credits: a
 * top-up checkout of the smallest pack that covers the shortfall
 * (`usePricing().packFor`), else the pricing page. Nothing while the
 * balance loads, when it is healthy, when billing is unconfigured, or once
 * dismissed: what stays is an empty live region the nudge appears in, so a
 * screen reader announces it.
 *
 * @internal
 */
defineOptions({ name: 'NoticeLowCredits' })
const props = withDefaults(defineProps<{
  /** Credit-meter name (or raw meter id). Defaults to the primary meter. */
  meter?: string
  /** Show below this balance. Default: `appConfig.backend.billing.lowCreditsThreshold`. */
  threshold?: number
  /** A credit-pack product key: turns the action into a top-up checkout of that pack. */
  pack?: string
  /** What the next action needs, in credits (an `insufficient_credits` refusal's `need`): it shows while the balance is below it, and preselects the smallest pack that covers the difference. */
  need?: number
  /** Offer a dismiss control. Default `true`. */
  dismissible?: boolean
  /** Same-tab redirect checkout (billing returns here). Default `true`. */
  redirect?: boolean
  /** The `low-credits` slot of `<BackendNotices>`, which replaces the whole notice. */
  slotContent?: (context: LowCreditsNoticeContext) => unknown
}>(), { meter: undefined, threshold: undefined, pack: undefined, need: undefined, dismissible: true, redirect: true, slotContent: undefined })

const emit = defineEmits({
  'dismissed': () => true,
  'topped-up': (_url: string) => true,
  'error': (_message: string) => true,
})
defineSlots<{
  /** The sentence with the balance. */
  message: (context: LowCreditsNoticeContext) => unknown
  /** The top-up button, or the link to the plans. */
  action: (context: LowCreditsNoticeContext) => unknown
  /** The dismiss button. */
  dismiss: (context: LowCreditsNoticeContext) => unknown
}>()

const credits = useCredits({ meter: () => props.meter })
const billing = useBilling()
const config = useBackendConfig()
const labels = useLabels('credits')
const { t, rich } = labels
const pricingPath = useBackendPagePath('pricing')
const dismissed = ref(false)
const pending: Ref<boolean> = ref(false)
// Why the last top-up failed, worded when it renders.
const failed: Ref<(() => string) | null> = ref(null)
// The package default is the last word: a config missing the key must not
// leave the threshold `undefined`, which would compare false and turn the
// nudge into a permanent banner.
const threshold = computed(() => props.threshold ?? config.billing.lowCreditsThreshold ?? backendAppConfigDefaults.billing.lowCreditsThreshold)
const isShort = (balance: number) => balance < threshold.value || (props.need !== undefined && balance < props.need)
// Only for the pack to preselect, and only while the notice shows one: read
// in the browser, so a layout that carries it never waits for the pricing
// on the server, nor holds it while the balance is fine.
const pricing = usePricing({
  server: false,
  actions: false,
  enabled: () => {
    const balance = credits.balance.value
    return !props.pack && !dismissed.value && billing.canManage.value && balance !== undefined && isShort(balance)
  },
})

// Dismissing removes the button that has focus. Focus stays where the
// notice was, on its region (focusable for this alone), so the next Tab
// moves on from there instead of from the top of the page.
const region = ref<HTMLElement | null>(null)
function dismiss(): void {
  const hadFocus = holdsFocus(region.value)
  dismissed.value = true
  emit('dismissed')
  if (hadFocus) void nextTick(() => returnFocus(region.value))
}
// The smallest pack that brings the balance back over the threshold, for whoever may buy one.
const preselected = computed(() => {
  const balance = credits.balance.value
  if (props.pack || balance === undefined || !billing.canManage.value) return undefined
  return pricing.packFor(Math.max(1, (props.need ?? threshold.value) - balance), props.meter)
})
async function topUp(): Promise<void> {
  const productId = props.pack ? billing.products.value?.[props.pack]?.id : preselected.value?.productId
  // A second press of the busy button does nothing; it keeps focus (`aria-disabled`).
  if (!productId || pending.value) return
  pending.value = true
  failed.value = null
  try {
    const url = await credits.topUp(productId, { redirect: props.redirect })
    if (url) emit('topped-up', url)
  }
  catch (failure) {
    failed.value = () => refusalText(labels, failure, t('topUpFailed'))
    emit('error', failed.value())
  }
  finally {
    pending.value = false
  }
}

/** The nudge's state, or `null`: `undefined` is "not loaded yet", and it never flashes at a customer whose balance turns out to be fine. */
const context = computed<LowCreditsNoticeContext | null>(() => {
  const balance = credits.balance.value
  if (balance === undefined || dismissed.value || !isShort(balance)) return null
  return { credits, balance, threshold: threshold.value, pricingPath: pricingPath.value ?? '', preselected: preselected.value, pending: pending.value, topUp, dismiss }
})
// `{balance}` becomes its own element so the number can be styled apart from the sentence.
const message = computed(() => context.value ? rich('low', { balance: h('span', { 'data-credits': 'balance' }, String(context.value.balance)), count: context.value.balance }) : [])
</script>

<template>
  <div
    ref="region"
    data-credits="region"
    tabindex="-1"
  >
    <!-- The live region stays mounted, empty while the balance is fine, so the nudge is announced when it appears in it. -->
    <div
      data-credits="live"
      role="status"
      aria-live="polite"
    >
      <template v-if="context && !turnedOff(props.slotContent, context)">
        <VNodes
          v-if="props.slotContent"
          :nodes="props.slotContent(context) as never"
        />
        <!-- Busy while the top-up checkout is being created, which the button says too. -->
        <div
          v-else
          data-credits="banner"
          :aria-busy="pending ? 'true' : undefined"
        >
          <slot
            name="message"
            v-bind="context"
          >
            <p data-credits="message">
              <VNodes :nodes="message" />
            </p>
          </slot>
          <slot
            name="action"
            v-bind="context"
          >
            <!-- The way back to more credits: a top-up of the named pack, else of the one preselected for the shortfall, else the link to the plans. -->
            <button
              v-if="pack || context.preselected"
              data-credits="action"
              type="button"
              :data-pack="pack ?? context.preselected!.key"
              v-bind="busyAttributes(pending)"
              @click="topUp"
            >
              {{ pending ? t('toppingUp') : pack ? t('topUp') : t('topUpPack', { pack: context.preselected!.name }) }}
            </button>
            <a
              v-else-if="context.pricingPath"
              data-credits="action"
              :href="context.pricingPath"
            >{{ t('topUp') }}</a>
          </slot>
          <template v-if="dismissible">
            <slot
              name="dismiss"
              v-bind="context"
            >
              <button
                data-credits="dismiss"
                type="button"
                :aria-label="t('dismiss')"
                @click="dismiss"
              >
                <span
                  data-credits="dismiss-icon"
                  aria-hidden="true"
                >×</span>
              </button>
            </slot>
          </template>
        </div>
      </template>
    </div>
    <p
      v-if="failed"
      data-credits="error"
      role="alert"
    >
      {{ failed() }}
    </p>
  </div>
</template>
