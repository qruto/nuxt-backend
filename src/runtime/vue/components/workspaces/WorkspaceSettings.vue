<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch, type Ref } from 'vue'
import { useBackendConfig } from '../../composables/use-backend-config'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useBilling } from '../../composables/use-billing'
import { useCredits } from '../../composables/use-credits'
import { useFeatures } from '../../composables/use-features'
import { refusalText, useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useWorkspace, type Workspace } from '../../composables/use-workspace'
import { inLocale } from '../../utils/intl'
import { useSettingsMessage } from '../../utils/settings-message'
import { workspaceSlug } from '../../utils/slug'
import type { CreditPack } from '../../../config'
import { createBillingSection } from './workspace-billing'
import { provideWorkspaceSettingsView, type WorkspaceSettingsSection, type WorkspaceSettingsSlotContext, type WorkspaceSettingsSlots } from './workspace-settings'

/**
 * Workspace, plan, and credits management — the billing entity is the
 * active workspace, so switching workspaces switches the subscription.
 * Sections: workspace list + create + switch (`WorkspaceList`); the plan
 * (`WorkspaceBilling`), which follows its subscription's state (a trial's
 * end, a failed payment to update in the portal, a pause to resume, a
 * cancellation to keep the plan from, a scheduled change to cancel) with
 * what it includes and a one-step cancellation; credits balance + top-up
 * (`WorkspaceCredits`).
 *
 * Markup on `data-settings` hooks; replace any region via its slot — each
 * slot receives {@link WorkspaceSettingsSlotContext}.
 */
defineOptions({ name: 'WorkspaceSettings' })

const props = withDefaults(defineProps<{
  sections?: WorkspaceSettingsSection[]
  /** Pricing page path for the "view plans" link. Default: the resolved default-page path. */
  pricingPath?: string
  /** Copy for this component, over `appConfig.backend.labels.settings` and the translations. */
  labels?: LabelOverrides<BackendLabels['settings']>
}>(), { sections: () => ['workspaces', 'billing', 'credits'], pricingPath: undefined, labels: undefined })

const emit = defineEmits({
  'workspace-created': (_workspace: Workspace) => true,
  'workspace-switched': (_id: string) => true,
  'plan-canceled': () => true,
  'plan-uncanceled': () => true,
  'plan-resumed': () => true,
  'change-canceled': () => true,
  'topped-up': (_key: string) => true,
  'error': (_message: string) => true,
})
const slots = defineSlots<WorkspaceSettingsSlots>()

const workspace = useWorkspace()
const billing = useBilling()
const credits = useCredits()
const features = useFeatures()
const config = useBackendConfig()
const labels = useLabels('settings', () => props.labels)
const { t, locale } = labels
const pricingPage = useBackendPagePath('pricing')
const pricingPath = computed(() => props.pricingPath || pricingPage.value || '')
const { note, message } = useSettingsMessage()
const pending: Ref<string | null> = ref(null)
const newName = ref('')
const root = ref<HTMLElement | null>(null)
const uid = useId()
const partId = (key: string, part: string) => `${uid}-${key}-${part}`
// What the running action waits for, announced by the status region.
const progress: Ref<(() => string) | null> = ref(null)

/**
 * Run one action, one at a time. A second press of a busy button does
 * nothing: the button stays focusable (`aria-disabled`) rather than
 * `disabled`, which would drop focus to the page. Nor does any other press
 * while an action runs: `pending` holds one key, so a second action would
 * take its place, and the first one's end would clear the second's, letting
 * a cancellation on its way be closed and sent again.
 */
async function run(key: string, busy: () => string, action: () => Promise<unknown>, okText?: () => string) {
  if (pending.value !== null) return
  note.value = null
  pending.value = key
  progress.value = busy
  try {
    await action()
    if (okText) note.value = { ok: true, text: okText }
  }
  catch (e) {
    note.value = { ok: false, text: () => refusalText(labels, e) }
    emit('error', message.value!.text)
  }
  finally {
    pending.value = null
    progress.value = null
  }
}

// After a switch the person made, focus goes to the row of the workspace
// they switched to, not back to the top of the page: once the session says
// it is active, which the auth client refetches after `setActive` resolves.
// A switch that never shows within five seconds lets it go.
const focusTarget = ref<string | null>(null)
let expiry: ReturnType<typeof setTimeout> | undefined
const settleFocus = () => {
  focusTarget.value = null
  clearTimeout(expiry)
}
watch([() => workspace.current.value?.id, focusTarget], ([current, target]) => {
  if (!target || current !== target) return
  const rows = root.value?.querySelectorAll<HTMLElement>('[data-workspace-id]') ?? []
  ;[...rows].find(row => row.dataset.workspaceId === target)?.focus()
  settleFocus()
}, { flush: 'post' })
onBeforeUnmount(settleFocus)

const createWorkspace = async (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) return
  await run('create', () => t('creating'), async () => {
    const created = await workspace.create({ name: trimmed, slug: workspaceSlug(trimmed) })
    newName.value = ''
    emit('workspace-created', created)
  }, () => t('created', { name: trimmed }))
}
const switchWorkspace = (id: string) => run(`switch:${id}`, () => t('switching'), async () => {
  await workspace.setActive(id)
  emit('workspace-switched', id)
  clearTimeout(expiry)
  focusTarget.value = id
  expiry = setTimeout(settleFocus, 5000)
})
const buyPack = (key: string) => run(`pack:${key}`, () => t('toppingUp'), async () => {
  const id = (billing.products.value ?? {})[key]?.id
  if (!id) return
  await credits.topUp(id, { redirect: true })
  emit('topped-up', key)
})
const refreshCredits = () => run('refresh', () => t('refreshing'), () => credits.refresh())

const products = computed(() => billing.products.value ?? {})
const productName = (productId: string) => Object.values(products.value).find(product => product?.id === productId)?.name
// The app's packs, in its order; without any, every pack on sale — the
// catalog's one-time products, as `<PricingTable>` shows them.
const packs = computed<CreditPack[]>(() => config.billing.packs.length > 0
  ? config.billing.packs
  : Object.entries(products.value).flatMap(([key, product]) => product?.isRecurring === false && product.isArchived !== true ? [{ key }] : []))

const section = createBillingSection({
  billing,
  features,
  labels,
  pending,
  run,
  partId,
  productName,
  giftedProduct: plan => products.value[plan]?.id,
  // One event per outcome; the union reads as each of them.
  notify: event => emit(event as 'plan-canceled'),
  announce: (text) => {
    note.value = { ok: true, text }
  },
})

const planName = computed(() => {
  // Not known yet, or not readable: never claim the free plan.
  if (billing.subscription.value === undefined) return '—'
  const productId = billing.subscription.value?.productId
  if (!productId) return t('free')
  // A gifted plan is named by its plan: the pass product behind it is no plan on sale.
  const gifted = billing.pass.value ? products.value[billing.pass.value.plan]?.id : undefined
  return productName(gifted ?? productId) ?? t('unknownPlan')
})
// The subscription payload is loosely typed on the client.
const periodEnd = computed(() => {
  const raw = billing.subscription.value?.currentPeriodEnd
  return typeof raw === 'string' || typeof raw === 'number' ? inLocale(locale.value, tag => new Date(raw).toLocaleDateString(tag)) : null
})

const context = computed<WorkspaceSettingsSlotContext>(() => ({
  workspace,
  billing,
  credits,
  packs: packs.value,
  planName: planName.value,
  periodEnd: periodEnd.value,
  cancelAtPeriodEnd: billing.subscription.value?.cancelAtPeriodEnd === true,
  planState: section.state.value,
  benefits: section.benefits.value,
  pricingPath: pricingPath.value,
  message: message.value,
  pending: pending.value,
  createWorkspace,
  switchWorkspace,
  cancelPlan: section.cancelPlan,
  keepPlan: section.keepPlan,
  resumePlan: section.resumePlan,
  cancelChange: section.cancelChange,
  openPortal: section.openPortal,
  keepGifted: section.keepGifted,
  buyPack,
  refreshCredits,
}))

provideWorkspaceSettingsView({ labels, context, slots, newName, partId, section, products, productName })

const loading = computed(() => (billing.subscription.value === undefined && !billing.error.value) || credits.isLoading.value)
/** What the status announces: what an action waits for, then how it went, and that the plan or the credits are loading. */
const statusText = computed(() => {
  if (progress.value) return progress.value()
  if (billing.isFinishingCheckout.value) return t('finishingPurchase')
  if (message.value?.ok) return message.value.text
  return loading.value ? t('loading') : ''
})
</script>

<template>
  <div
    ref="root"
    data-settings="root"
    :aria-busy="pending ? 'true' : undefined"
  >
    <template
      v-for="name in sections"
      :key="name"
    >
      <slot
        v-if="name === 'workspaces'"
        name="workspaces"
        v-bind="context"
      >
        <WorkspaceList :workspace="workspace" />
      </slot>
      <slot
        v-else-if="name === 'billing'"
        name="billing"
        v-bind="context"
      >
        <WorkspaceBilling :billing="billing" />
      </slot>
      <slot
        v-else-if="name === 'credits'"
        name="credits"
        v-bind="context"
      >
        <WorkspaceCredits :credits="credits" />
      </slot>
    </template>
    <!-- A failure interrupts (`alert` is implicitly assertive); a confirmation is read out by the status region below. -->
    <p
      v-if="message"
      data-settings="message"
      :data-tone="message.ok ? 'ok' : 'error'"
      :role="message.ok ? undefined : 'alert'"
    >
      {{ message.text }}
    </p>
    <slot
      name="footer"
      v-bind="context"
    />
    <p
      data-settings="status"
      role="status"
      aria-live="polite"
    >
      {{ statusText }}
    </p>
  </div>
</template>
