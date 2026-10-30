import { customersDeleteExternal } from '@polar-sh/sdk/funcs/customersDeleteExternal.js'
import { customersMembersDeleteExternal } from '@polar-sh/sdk/funcs/customersMembersDeleteExternal.js'
import { ordersList } from '@polar-sh/sdk/funcs/ordersList.js'
import { logBackend } from '../../log.js'
import { type BillingContext, isProviderNotFound } from './context.js'
import type { ProviderCtx, RunWriteCtx } from './types/base.js'
import type { AccountBillingErasure, AccountBillingExport } from './types/surface.js'

// Billing's part of an account's export and erasure, in the app: the
// provider customer of each billing entity that goes with the account, and
// its member of each workspace's team customer that stays. The component's
// own billing cache is erased by the component (`account.forget`), which
// marks each entity as deleting first, so the subscription that ends when
// its customer goes starts no free plan again.

/** The most orders an export lists per billing entity: the newest ones. */
const EXPORT_ORDERS_MAX = 100

/** Export and erasure of one `setupBilling` call. */
export function createBillingErasure(
  { billTo, provider, accessToken, unwrapProvider }: BillingContext,
  forgetEntity: (ctx: RunWriteCtx, entityId: string) => Promise<void>,
) {
  /** The billing entities that go with an account: the workspaces it was the only member of, or itself when billed on its own. */
  const entitiesOf = ({ userId, deleted }: { userId: string, deleted: readonly string[] }): string[] =>
    billTo === 'user' ? [userId] : [...deleted]

  /** A provider refusal, unless it says the thing is gone already. */
  const unlessGone = (result: { ok: true } | { ok: false, error: unknown }, operation: string): void => {
    if (!result.ok && !isProviderNotFound(result.error)) unwrapProvider(result as { ok: false, error: unknown }, operation)
  }

  /**
   * The provider customer of every entity that goes with the account,
   * deleted and anonymized at the provider (which keeps its orders for its
   * books), then its quota counts and cache; the account's member of each
   * workspace's team customer that stays, removed. A customer or a member
   * already gone is fine, so it is safe to run again. Without an access
   * token there is nothing at the provider to erase.
   */
  const forgetAccount: AccountBillingErasure = async (ctx, erasure) => {
    for (const entityId of entitiesOf(erasure)) {
      if (accessToken) unlessGone(await customersDeleteExternal(provider.polar, { externalId: entityId, anonymize: true }), 'customer erasure')
      await forgetEntity(ctx, entityId)
    }
    if (billTo !== 'workspace' || !accessToken) return
    for (const workspaceId of erasure.left) {
      unlessGone(await customersMembersDeleteExternal(provider.polar, { externalId: workspaceId, memberExternalId: erasure.userId }), 'member erasure')
    }
  }

  /** The newest orders of one entity's customer, as an export lists them; `null` when the provider could not be read. */
  const ordersOf = async (entityId: string) => {
    if (!accessToken) return []
    const result = await ordersList(provider.polar, { externalCustomerId: entityId, limit: EXPORT_ORDERS_MAX, sorting: ['-created_at'] })
    if (!result.ok) {
      if (isProviderNotFound(result.error)) return []
      logBackend('warn', 'billing.provider_failed', 'An account export could not read its orders at the billing provider; the export goes without them.')
      return null
    }
    return result.value.result.items.map(order => ({
      id: order.id,
      createdAt: order.createdAt.toISOString(),
      status: String(order.status),
      productId: order.productId ?? null,
      amount: order.netAmount,
      currency: order.currency,
      billingReason: String(order.billingReason),
    }))
  }

  /**
   * What billing holds of the entities an account owns alone, for its
   * export: each one's subscriptions as the app synced them, and its orders
   * at the provider.
   */
  const exportAccount: AccountBillingExport = async (ctx, account) => Promise.all(entitiesOf(account).map(async entityId => ({
    entityId,
    subscriptions: await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId: entityId }),
    orders: await ordersOf(entityId),
  })))

  return { forgetAccount, exportAccount }
}
