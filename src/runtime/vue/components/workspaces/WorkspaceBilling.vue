<script setup lang="ts">
import { computed, resolveComponent } from 'vue'
import { busyAttributes } from '../../a11y'
import { valueLabel } from '../../composables/use-labels'
import type { EntitlementBenefit } from '../../composables/use-billing'
import type { WorkspaceBillingProps } from '../../parts'
import CancelConfirmGroup from '../billing/CancelConfirmGroup.vue'
import { IN_PORTAL, type PlanState } from './workspace-billing'
import { useWorkspaceSettingsView } from './workspace-settings'

/**
 * `<WorkspaceSettings>`'s plan: its name and state (a trial's end, a failed
 * payment to update in the portal, a pause to resume, a cancellation to keep
 * the plan from, a scheduled change to cancel), the one action each state
 * calls for, what it includes, and a cancellation that takes one step. Only
 * the workspace's billing managers get the buttons.
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
const loading = computed(() => (props.billing.subscription.value === undefined && !props.billing.error.value) || finishing.value)
const failed = computed(() => props.billing.subscription.value === undefined && props.billing.error.value)
const managing = computed(() => props.billing.canManage.value)

/** A button of the section: busy while its own action runs, and keeping focus through it. */
const pending = (key: string) => view.context.value.pending === key
const press = (key: string, action: () => unknown) => (pending(key) ? undefined : action())

const gifted = computed(() => section.state.value === 'gifted')
const keepOffered = computed(() => gifted.value && managing.value)
// A gifted plan has no card to cancel: the one offer is to keep it.
const cancellable = computed(() => !gifted.value && !props.billing.cancelAtPeriodEnd.value && !props.billing.isPaused.value)
/** The portal button comes first when a payment failed, its own action; then the plan's own ways back. A gifted plan has no card to manage. */
const portalFirst = computed(() => section.state.value === 'past_due')
const portalLast = computed(() => !portalFirst.value && !gifted.value)
/**
 * What "Cancel plan" opens: the one-step group, or, with save offers on,
 * `<CancelFlow>` (one optional question and at most one offer, "Cancel my
 * plan" on every screen) while the group would be open.
 */
const cancelling = computed(() => {
  if (props.billing.saveOffers?.value !== true) return { is: CancelConfirmGroup, props: { confirm: section.confirm } }
  if (!section.confirm.isOpen.value) return { is: () => null, props: {} }
  const done = () => section.confirm.settle()
  return { is: resolveComponent('CancelFlow'), props: { id: view.partId('cancel', 'confirm'), onClose: () => section.confirm.close(), onCanceled: done, onKept: done } }
})
/** A scheduled plan change can be cancelled, unless the plan is set to end. */
const changeCancellable = computed(() => props.billing.pendingChange.value !== null && !props.billing.cancelAtPeriodEnd.value)

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
        <!-- What the buttons offer follows the subscription, not only the state its line reads as: a plan set to cancel offers Keep plan, and one with a change scheduled offers to cancel the change, whatever else holds. -->
        <div data-settings="plan-actions">
          <button
            v-if="portalFirst"
            data-settings="portal"
            type="button"
            v-bind="busyAttributes(pending('portal'))"
            @click="press('portal', section.openPortal)"
          >
            {{ pending('portal') ? t('openingPortal') : t('updatePayment') }}
          </button>
          <button
            v-if="billing.isPaused.value"
            data-settings="resume"
            type="button"
            v-bind="busyAttributes(pending('resume'))"
            @click="press('resume', section.resumePlan)"
          >
            {{ pending('resume') ? t('resuming') : t('resume') }}
          </button>
          <button
            v-if="billing.cancelAtPeriodEnd.value"
            data-settings="uncancel"
            type="button"
            v-bind="busyAttributes(pending('uncancel'))"
            @click="press('uncancel', section.keepPlan)"
          >
            {{ pending('uncancel') ? t('keeping') : t('keepPlan') }}
          </button>
          <button
            v-if="changeCancellable"
            data-settings="cancel-change"
            type="button"
            v-bind="busyAttributes(pending('cancel-change'))"
            @click="press('cancel-change', section.cancelChange)"
          >
            {{ pending('cancel-change') ? t('cancelingChange') : t('cancelChange') }}
          </button>
          <button
            v-if="portalLast"
            data-settings="portal"
            type="button"
            v-bind="busyAttributes(pending('portal'))"
            @click="press('portal', section.openPortal)"
          >
            {{ pending('portal') ? t('openingPortal') : t('portal') }}
          </button>
          <button
            v-if="cancellable"
            data-settings="cancel"
            type="button"
            v-bind="section.confirm.toggleProps()"
          >
            {{ t('cancel') }}
          </button>
        </div>
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
