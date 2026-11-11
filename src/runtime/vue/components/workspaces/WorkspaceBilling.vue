<script setup lang="ts">
import { computed, resolveComponent, type Ref } from 'vue'
import { busyAttributes } from '../../a11y'
import { valueLabel } from '../../composables/use-labels'
import type { EntitlementBenefit } from '../../composables/use-billing'
import type { BillingSectionAction } from '../../composables/use-billing-section'
import type { WorkspaceBillingProps } from '../../parts'
import CancelConfirmGroup from '../billing/CancelConfirmGroup.vue'
import { IN_PORTAL, type PlanState } from './workspace-billing'
import WorkspaceBillingPause from './WorkspaceBillingPause.vue'
import WorkspaceBillingSwitch from './WorkspaceBillingSwitch.vue'
import { useWorkspaceSettingsView } from './workspace-settings'

/**
 * `<WorkspaceSettings>`'s plan: its name and state (a trial's end, a failed
 * payment to update in the portal, a pause to resume, a cancellation to keep
 * the plan from, a scheduled change to cancel), the one action each state
 * calls for, what it includes, a switch to another plan or billing period
 * that says when it applies and how the period settles before it does, a
 * pause of one to three months from the period's end, and a cancellation
 * that takes one step. Only the workspace's billing managers get the buttons.
 */
defineOptions({ name: 'WorkspaceBilling' })
const props = defineProps<WorkspaceBillingProps>()
const view = useWorkspaceSettingsView('WorkspaceBilling')
const { labels, section } = view
const { t } = labels
const { stateLine } = section
const subscriptionField = (field: string): unknown => props.billing.subscription.value?.[field]

/** A date phrase, when there is a date to put in it. */
const when = (key: 'resumes' | 'ends' | 'trialEnds' | 'renews' | 'giftedUntil', value: unknown): string | null => {
  const text = section.date(value)
  return text ? t(key, { date: text }) : null
}
/** When a plan set to cancel ends, whatever state it reads as. */
const ending = (): string | null => props.billing.cancelAtPeriodEnd.value
  ? when('ends', subscriptionField('endsAt') ?? subscriptionField('currentPeriodEnd'))
  : null
/** The state line's words, by state: what the plan is, then when that changes. */
const STATE_WORDS: Record<PlanState, () => [string, string | null]> = {
  // A plan someone gave: for how long, never a renewal.
  gifted: () => [t('gifted'), when('giftedUntil', props.billing.pass.value?.endsAt)],
  // A failed payment or a pause can also be set to end: the line says when.
  past_due: () => [t('pastDue'), ending()],
  paused: () => [t('paused'), when('resumes', props.billing.resumesAt.value) ?? ending()],
  canceling: () => [t('cancels'), ending()],
  changing: () => {
    const change = props.billing.pendingChange.value!
    return [t('changing'), t('changesTo', { plan: view.productName(change.productId) ?? t('unknownPlan'), date: section.date(change.appliesAt) ?? '' })]
  },
  trialing: () => [t('onTrial'), when('trialEnds', props.billing.trialEnd.value)],
  active: () => [t('planActive'), when('renews', subscriptionField('currentPeriodEnd'))],
}
const TONES: Record<PlanState, 'ok' | 'warn' | 'error'> = { gifted: 'ok', past_due: 'error', paused: 'warn', canceling: 'warn', changing: 'warn', trialing: 'ok', active: 'ok' }

const words = computed(() => (section.state.value ? STATE_WORDS[section.state.value]() : null))
// Busy until the plan is known (its name reads "—" until then), unless the
// read failed, and while a return from checkout is being finished.
const finishing = computed(() => props.billing.isFinishingCheckout.value)
const loading = section.plan.isLoading
const failed = computed(() => section.plan.state.value === 'error')
const managing = computed(() => props.billing.canManage.value)

/** A button of the section: busy while its own action runs, and keeping focus through it. */
const pending = (key: string) => view.context.value.pending === key
const press = (key: string, action: () => unknown) => (pending(key) ? undefined : action())

// A gifted plan has no card to cancel: the one offer is to keep it.
const keepOffered = computed(() => section.actions.value.includes('keep-gifted'))
const cancellable = section.plan.cancellable
/**
 * What "Cancel plan" opens: the one-step group, or, with save offers on,
 * `<CancelFlow>` (one optional question and at most one offer, "Cancel my
 * plan" on every screen) while the group would be open.
 */
const cancelling = computed(() => {
  if (props.billing.saveOffers?.value !== true) return { is: CancelConfirmGroup, props: { confirm: section.confirm } }
  if (!section.confirm.isOpen.value) return { is: () => null, props: {} }
  return { is: resolveComponent('CancelFlow'), props: { id: view.partId('cancel', 'confirm'), onClose: () => section.confirm.close(), onCanceled: section.flowCanceled, onKept: section.flowKept } }
})
/** One button of the plan's row: its hook, what it carries and what it says, and where a group it opens gives focus back. */
interface PlanButton { hook: string, attributes: Record<string, unknown>, text: string, element?: Ref<HTMLElement | null> }
/** A button that opens and closes a group: the group's toggle, its element kept for the focus coming back. */
const opens = (hook: string, text: string, toggle: Record<string, unknown>): PlanButton => {
  const { ref: element, ...attributes } = toggle as { ref: Ref<HTMLElement | null> }
  return { hook, attributes, text, element }
}
/** A button that runs one action: busy while it runs, saying so, and keeping focus. */
const runs = (hook: string, key: string, idle: string, busy: string, action: () => unknown): PlanButton => ({
  hook,
  attributes: { ...busyAttributes(pending(key)), onClick: () => press(key, action) },
  text: pending(key) ? busy : idle,
})
/** Each button of the plan's row, by what it offers; keeping a gifted plan has a row of its own. */
const BUTTONS: Record<Exclude<BillingSectionAction, 'keep-gifted'>, () => PlanButton> = {
  // A failed payment's portal button says what it is for.
  'portal': () => runs('portal', 'portal', section.state.value === 'past_due' ? t('updatePayment') : t('portal'), t('openingPortal'), section.openPortal),
  'resume': () => runs('resume', 'resume', t('resume'), t('resuming'), section.resumePlan),
  'uncancel': () => runs('uncancel', 'uncancel', t('keepPlan'), t('keeping'), section.keepPlan),
  'cancel-change': () => runs('cancel-change', 'cancel-change', t('cancelChange'), t('cancelingChange'), section.cancelChange),
  'change-plan': () => opens('change-plan', t('changePlan'), section.switchToggleProps()),
  'pause': () => opens('pause', t('pause'), section.pauseToggleProps()),
  'cancel': () => opens('cancel', t('cancel'), section.confirm.toggleProps()),
}
/**
 * The plan's buttons, in the order `useBillingSection().actions` offers
 * them. What they offer follows the subscription, not only the state its
 * line reads as: a plan set to cancel offers Keep plan, and one with a
 * change scheduled offers to cancel the change, whatever else holds.
 */
const actions = computed<PlanButton[]>(() => section.actions.value.flatMap(action => (action === 'keep-gifted' ? [] : [BUTTONS[action]()])))

/** One benefit: its name (else what it gives), what it gives, and what it holds. */
const kind = (benefit: EntitlementBenefit) => valueLabel(labels, 'settings', 'benefitKinds', benefit.kind ?? 'other')
const detail = (benefit: EntitlementBenefit) => benefit.licenseKey ?? benefit.repository ?? (benefit.files === undefined ? null : t('files', { count: benefit.files }))
const benefitsTitle = view.partId('benefits', 'title')
// Only who may open the portal is pointed at it.
const portalNote = computed(() => managing.value && section.benefits.value.some(benefit => IN_PORTAL.has(benefit.kind ?? 'other')))
</script>

<template>
  <section
    data-settings="section-billing"
    :aria-busy="loading ? 'true' : undefined"
  >
    <h3 data-settings="section-title">
      {{ t('plan') }}
    </h3>
    <p data-settings="plan-name">
      {{ view.context.value.planName }}
    </p>
    <!-- Why the plan could not be read; the status region announces a return's finish. -->
    <p
      v-if="failed"
      data-settings="plan-error"
      role="alert"
    >
      {{ labels.errorMessage(billing.error.value) }}
    </p>
    <p
      v-if="finishing"
      data-settings="finishing"
    >
      {{ t('finishingPurchase') }}
    </p>
    <template v-if="section.state.value && words">
      <!-- Focus lands here once a cancellation went through. -->
      <p
        ref="stateLine"
        data-settings="plan-status"
        :data-state="section.state.value"
        :data-tone="TONES[section.state.value]"
        tabindex="-1"
      >
        {{ words[0] }}<span
          v-if="words[1]"
          data-settings="period"
        > · {{ words[1] }}</span>
      </p>
      <p
        v-if="section.state.value === 'past_due'"
        data-settings="plan-hint"
      >
        {{ t('pastDueHint') }}
      </p>
    </template>
    <div
      v-if="section.benefits.value.length > 0"
      data-settings="benefits"
    >
      <h4
        :id="benefitsTitle"
        data-settings="benefits-title"
      >
        {{ t('benefits') }}
      </h4>
      <ul
        data-settings="benefit-list"
        :aria-labelledby="benefitsTitle"
      >
        <li
          v-for="benefit in section.benefits.value"
          :key="benefit.id"
          data-settings="benefit"
          :data-kind="benefit.kind ?? 'other'"
        >
          <span data-settings="benefit-name">{{ benefit.name ?? kind(benefit) }}</span>
          <span
            v-if="benefit.name"
            data-settings="benefit-kind"
          >{{ kind(benefit) }}</span>
          <span
            v-if="detail(benefit)"
            data-settings="benefit-detail"
          >{{ detail(benefit) }}</span>
        </li>
      </ul>
      <p
        v-if="portalNote"
        data-settings="benefits-portal"
      >
        {{ t('benefitsPortal') }}
      </p>
    </div>
    <!-- A gifted plan has no card to cancel: its one offer is to keep it. -->
    <div
      v-if="keepOffered"
      data-settings="plan-actions"
    >
      <button
        data-settings="keep-gifted"
        type="button"
        v-bind="busyAttributes(pending('keep-gifted'))"
        @click="press('keep-gifted', section.keepGifted)"
      >
        {{ pending('keep-gifted') ? t('keepingGiftedPlan') : t('keepGiftedPlan') }}
      </button>
    </div>
    <template v-if="section.state.value">
      <template v-if="managing">
        <div data-settings="plan-actions">
          <button
            v-for="action in actions"
            :key="action.hook"
            :ref="(element) => action.element && (action.element.value = element as HTMLElement | null)"
            :data-settings="action.hook"
            type="button"
            v-bind="action.attributes"
          >
            {{ action.text }}
          </button>
        </div>
        <WorkspaceBillingSwitch />
        <WorkspaceBillingPause />
        <component
          :is="cancelling.is"
          v-if="cancellable"
          v-bind="cancelling.props"
        />
      </template>
      <p
        v-else
        data-settings="managed"
      >
        {{ t('managed') }}
      </p>
    </template>
    <a
      v-if="view.context.value.pricingPath"
      data-settings="pricing-link"
      :href="view.context.value.pricingPath"
    >{{ t('viewPlans') }}</a>
  </section>
</template>
