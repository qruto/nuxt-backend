import { computed, defineComponent, h, ref, type PropType, type Ref, type VNodeChild } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useOrganization, type UseOrganizationReturn, type Workspace } from '../composables/use-organization'
import { useBilling, type UseBillingReturn } from '../composables/use-billing'
import { useCredits, type UseCreditsReturn } from '../composables/use-credits'
import { useBackendConfig } from '../composables/use-backend-config'
import { unwrapAuth } from '../utils/auth-result'
import type { CreditPack } from '../../config'

export type WorkspaceSettingsSection = 'workspaces' | 'billing' | 'credits'

export interface SettingsMessage {
  text: string
  ok: boolean
}

export interface WorkspaceSettingsSlotContext {
  workspace: UseOrganizationReturn
  billing: UseBillingReturn
  credits: UseCreditsReturn
  packs: CreditPack[]
  planName: string
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  pricingPath: string
  message: SettingsMessage | null
  pending: string | null
  createWorkspace: (name: string) => Promise<void>
  switchWorkspace: (id: string) => Promise<void>
  cancelPlan: () => Promise<void>
  buyPack: (key: string) => Promise<void>
  refreshCredits: () => Promise<void>
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Workspace, plan, and credits management as one headless component — the
 * billing entity is the active workspace, so switching workspaces switches
 * the subscription. Sections: workspace list + create + switch, billing
 * summary (plan / period / cancel), credits balance + top-up.
 *
 * Headless markup on `data-settings` hooks; replace any region via its slot —
 * each slot receives {@link WorkspaceSettingsSlotContext}.
 */
export const WorkspaceSettings = defineComponent({
  name: 'WorkspaceSettings',
  props: {
    sections: {
      type: Array as PropType<WorkspaceSettingsSection[]>,
      default: () => ['workspaces', 'billing', 'credits'] as WorkspaceSettingsSection[],
    },
    /** Pricing page path for the "view plans" link. Default: the resolved default-page path. */
    pricingPath: { type: String, default: undefined },
  },
  emits: {
    'workspace-created': (_workspace: unknown) => true,
    'workspace-switched': (_id: string) => true,
    'plan-canceled': () => true,
    'topped-up': (_key: string) => true,
    'error': (_message: string) => true,
  },
  setup(props, { slots, emit }) {
    const workspace = useOrganization()
    const billing = useBilling()
    const credits = useCredits()
    const config = useBackendConfig()
    const labels = { ...config.labels.settings }
    const runtime = useRuntimeConfig().public as { backend?: { pages?: Record<string, string> } }
    const pricingPath = computed(() => props.pricingPath || runtime.backend?.pages?.pricing || '/pricing')

    const message: Ref<SettingsMessage | null> = ref(null)
    const pending: Ref<string | null> = ref(null)
    const newName = ref('')

    async function run(key: string, action: () => Promise<unknown>, okText?: string) {
      message.value = null
      pending.value = key
      try {
        await action()
        if (okText) message.value = { text: okText, ok: true }
      }
      catch (e) {
        const text = e instanceof Error ? e.message : 'Something went wrong'
        message.value = { text, ok: false }
        emit('error', text)
      }
      finally {
        pending.value = null
      }
    }

    const createWorkspace = async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await run('create', async () => {
        const created = unwrapAuth(await workspace.create({ name: trimmed, slug: slugify(trimmed) }))
        newName.value = ''
        emit('workspace-created', created)
      }, `Workspace “${trimmed}” created.`)
    }
    const switchWorkspace = (id: string) => run(`switch:${id}`, async () => {
      await workspace.setActive(id)
      emit('workspace-switched', id)
    })
    const cancelPlan = () => run('cancel', async () => {
      await billing.cancel()
      emit('plan-canceled')
    }, 'Subscription set to cancel at period end.')
    const buyPack = (key: string) => run(`pack:${key}`, async () => {
      const id = (billing.products.value ?? {})[key]?.id
      if (!id) return
      await credits.topUp(id, { redirect: true })
      emit('topped-up', key)
    })
    const refreshCredits = () => run('refresh', () => credits.refresh())

    const products = computed(() => billing.products.value ?? {})
    const planName = computed(() => {
      const productId = billing.subscription.value?.productId
      if (!productId) return 'Free'
      return Object.values(products.value).find(product => product?.id === productId)?.name ?? 'Unknown plan'
    })
    // The subscription payload is loosely typed on the client.
    const periodEnd = computed(() => {
      const raw = billing.subscription.value?.currentPeriodEnd
      return typeof raw === 'string' || typeof raw === 'number' ? new Date(raw).toLocaleDateString() : null
    })
    const cancelAtPeriodEnd = computed(() => billing.subscription.value?.cancelAtPeriodEnd === true)

    const context = (): WorkspaceSettingsSlotContext => ({
      workspace,
      billing,
      credits,
      packs: config.billing.packs,
      planName: planName.value,
      periodEnd: periodEnd.value,
      cancelAtPeriodEnd: cancelAtPeriodEnd.value,
      pricingPath: pricingPath.value,
      message: message.value,
      pending: pending.value,
      createWorkspace,
      switchWorkspace,
      cancelPlan,
      buyPack,
      refreshCredits,
    })

    const workspaceRow = (entry: Workspace): VNodeChild => {
      const active = entry.id === workspace.current.value?.id
      const ctx = { ...context(), entry, active }
      if (slots.workspace) return slots.workspace(ctx)
      return h('li', {
        'data-settings': 'workspace',
        'data-active': active || undefined,
        'key': entry.id,
      }, [
        h('span', { 'data-settings': 'workspace-name' }, entry.name),
        h('span', { 'data-settings': 'workspace-slug' }, entry.slug),
        active
          ? h('span', { 'data-settings': 'active-badge' }, 'Active')
          : h('button', {
              'data-settings': 'switch',
              'type': 'button',
              'disabled': pending.value === `switch:${entry.id}`,
              'onClick': () => switchWorkspace(entry.id),
            }, labels.switch ?? 'Switch'),
      ])
    }

    const workspacesSection = (): VNodeChild => {
      const ctx = context()
      if (slots.workspaces) return slots.workspaces(ctx)
      return h('section', { 'data-settings': 'section-workspaces' }, [
        h('h3', { 'data-settings': 'section-title' }, 'Workspaces'),
        h('ul', { 'data-settings': 'workspace-list' }, workspace.organizations.value.map(workspaceRow)),
        slots.create?.(ctx) ?? h('form', {
          'data-settings': 'create-form',
          'onSubmit': (event: Event) => {
            event.preventDefault()
            void createWorkspace(newName.value)
          },
        }, [
          h('input', {
            'data-settings': 'input-name',
            'type': 'text',
            'placeholder': 'New workspace name',
            'required': true,
            'value': newName.value,
            'onInput': (event: Event) => { newName.value = (event.target as HTMLInputElement).value },
          }),
          h('button', {
            'data-settings': 'create',
            'type': 'submit',
            'disabled': pending.value === 'create',
          }, pending.value === 'create' ? '…' : labels.create ?? 'Create workspace'),
        ]),
      ])
    }

    const billingSection = (): VNodeChild => {
      const ctx = context()
      if (slots.billing) return slots.billing(ctx)
      return h('section', { 'data-settings': 'section-billing' }, [
        h('h3', { 'data-settings': 'section-title' }, 'Plan'),
        h('p', { 'data-settings': 'plan-name' }, planName.value),
        billing.isSubscribed.value
          ? h('p', { 'data-settings': 'plan-status', 'data-tone': cancelAtPeriodEnd.value ? 'warn' : 'ok' }, [
              cancelAtPeriodEnd.value ? 'Cancels at period end' : 'Active',
              periodEnd.value ? h('span', { 'data-settings': 'period' }, ` · renews ${periodEnd.value}`) : null,
            ])
          : null,
        h('a', { 'data-settings': 'pricing-link', 'href': pricingPath.value }, labels.viewPlans ?? 'View plans'),
        billing.isSubscribed.value && !cancelAtPeriodEnd.value
          ? h('button', {
              'data-settings': 'cancel',
              'type': 'button',
              'disabled': pending.value === 'cancel',
              'onClick': cancelPlan,
            }, pending.value === 'cancel' ? '…' : labels.cancel ?? 'Cancel plan')
          : null,
      ])
    }

    const creditsSection = (): VNodeChild => {
      const ctx = context()
      if (slots.credits) return slots.credits(ctx)
      return h('section', { 'data-settings': 'section-credits' }, [
        h('h3', { 'data-settings': 'section-title' }, 'Credits'),
        h('p', { 'data-settings': 'balance' }, `${credits.balance.value ?? '—'} credits`),
        h('p', { 'data-settings': 'usage' }, [
          h('span', { 'data-settings': 'credited' }, `${credits.credited.value ?? 0} credited`),
          ' · ',
          h('span', { 'data-settings': 'consumed' }, `${credits.consumed.value ?? 0} used`),
        ]),
        h('div', { 'data-settings': 'topup' }, config.billing.packs.map(pack => h('button', {
          'data-settings': 'topup-pack',
          'type': 'button',
          'key': pack.key,
          'disabled': pending.value === `pack:${pack.key}` || !products.value[pack.key],
          'onClick': () => buyPack(pack.key),
        }, pending.value === `pack:${pack.key}` ? '…' : `${products.value[pack.key]?.name ?? pack.key}`))),
        h('button', {
          'data-settings': 'refresh',
          'type': 'button',
          'disabled': pending.value === 'refresh',
          'onClick': refreshCredits,
        }, 'Refresh'),
      ])
    }

    const sectionRenderers: Record<WorkspaceSettingsSection, () => VNodeChild> = {
      workspaces: workspacesSection,
      billing: billingSection,
      credits: creditsSection,
    }

    return () => h('div', { 'data-settings': 'root' }, [
      ...props.sections.map(section => sectionRenderers[section]?.()),
      message.value
        ? h('p', { 'data-settings': 'message', 'data-tone': message.value.ok ? 'ok' : 'error', 'role': 'status' }, message.value.text)
        : null,
      slots.footer?.(context()) ?? null,
    ])
  },
})
