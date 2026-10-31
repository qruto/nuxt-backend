<script setup lang="ts">
import { useAction } from 'nuxt-convex-module/client'
import { notConfigured } from '../../composables/billing-provider'
import type { BillingApi } from '../../composables/use-billing'
import { useCanManage } from '../../utils/billing-access'
import { useBackendNamespace } from '../../utils/namespace'
import { openProviderUrl } from '../../utils/open-url'
import { type BillingLinkSlots, useClickSession } from './billing-links'

/**
 * A link that opens the billing customer portal for the caller's billing
 * entity, through the app's `generateCustomerPortalUrl`, on click. With
 * workspaces the portal is the caller's own member of the workspace's
 * billing customer: anyone but its owner or an admin is refused
 * (`forbidden`, reason `not_billing_manager`), and an entity that never
 * paid has no portal yet (`not_ready`, reason `no_customer`) — both emitted
 * as `error`. It renders nothing for a caller the server says manages none
 * of the billing (`useBilling().canManage`).
 *
 * @example
 * ```vue
 * <BillingPortalLink return-url="/app/billing">Manage billing</BillingPortalLink>
 * ```
 */
defineOptions({ name: 'BillingPortalLink' })

const props = withDefaults(defineProps<{
  /** Where the portal's back link returns to, on the site's own origin. Defaults to the current page. */
  returnUrl?: string
  /**
   * Open in the same tab (the default). `false` opens a new tab, which a
   * browser may block: the tab opens only once the session exists.
   */
  redirect?: boolean
  /** Override the injected `api.billing` namespace. */
  api?: BillingApi
}>(), { returnUrl: undefined, redirect: true, api: undefined })

const emit = defineEmits({ error: (_error: unknown) => true })
defineSlots<BillingLinkSlots>()

const billing = useBackendNamespace<BillingApi>('billing', 'BillingPortalLink', props.api)
const runPortal = billing.generateCustomerPortalUrl ? useAction(billing.generateCustomerPortalUrl) : null
const canManage = useCanManage(billing.getBillingAccess)
const { pending, onClick } = useClickSession(async () => {
  if (!runPortal) notConfigured('portal')
  const here = typeof window === 'undefined' ? undefined : window.location.href
  const returnUrl = props.returnUrl && typeof window !== 'undefined' ? new URL(props.returnUrl, window.location.href).href : here
  const { url } = await runPortal({ returnUrl })
  openProviderUrl(url, props.redirect)
}, emit)
</script>

<template>
  <a
    v-if="canManage"
    href="#"
    data-billing="portal-link"
    :aria-busy="pending || undefined"
    :aria-disabled="pending || undefined"
    :data-pending="pending || undefined"
    :data-state="pending ? 'pending' : 'idle'"
    @click="onClick"
  ><slot :pending="pending" /></a>
</template>
