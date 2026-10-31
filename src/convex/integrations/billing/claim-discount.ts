import { discountsCreate } from '@polar-sh/sdk/funcs/discountsCreate.js'
import { discountsDelete } from '@polar-sh/sdk/funcs/discountsDelete.js'
import { discountsList } from '@polar-sh/sdk/funcs/discountsList.js'
import { discountsUpdate } from '@polar-sh/sdk/funcs/discountsUpdate.js'
import { type BillingContext, isProviderNotFound } from './context.js'

// The single-use, code-free 100% discount behind a claim at no cost: a gift's
// pack for its recipient, a referral's pack for its referrer. The server puts
// it on a $0 checkout and no one else ever sees it.

type ClaimProvider = Pick<BillingContext, 'provider' | 'unwrapProvider'>

/**
 * Mint a claim discount once: codeless, 100%, once, a single redemption, on
 * the given products only, named `<kind>-<id>` with no personal data. A run
 * that minted but never stored it finds it by name; a lookup that fails
 * stops the run rather than minting a second one.
 */
export async function mintClaimDiscount({ provider, unwrapProvider }: ClaimProvider, claim: { kind: 'gift' | 'referral', id: string, productIds: string[] }, operation: string): Promise<string> {
  const name = `${claim.kind}-${claim.id}`
  const key = `${claim.kind}Id`
  const listed = unwrapProvider(await discountsList(provider.polar, { query: name, limit: 10 }), operation)
  const minted = listed.result.items.find(discount => discount.metadata?.[key] === claim.id)
  if (minted) return minted.id
  const created = await discountsCreate(provider.polar, {
    type: 'percentage',
    basisPoints: 10_000,
    duration: 'once',
    maxRedemptions: 1,
    products: claim.productIds,
    name,
    metadata: { [key]: claim.id },
  })
  return unwrapProvider(created, operation).id
}

/** End a discount now and delete it; one already gone is fine. Ended first, so a failed deletion leaves nothing to redeem. */
export async function voidClaimDiscount({ provider, unwrapProvider }: ClaimProvider, discountId: string, operation: string): Promise<void> {
  for (const done of [
    await discountsUpdate(provider.polar, { id: discountId, discountUpdate: { endsAt: new Date() } }),
    await discountsDelete(provider.polar, { id: discountId }),
  ]) {
    if (!done.ok && !isProviderNotFound(done.error)) unwrapProvider(done, operation)
  }
}
