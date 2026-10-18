import { customerSessionsCreate } from '@polar-sh/sdk/funcs/customerSessionsCreate.js'
import { customersCreate } from '@polar-sh/sdk/funcs/customersCreate.js'
import { customersGet } from '@polar-sh/sdk/funcs/customersGet.js'
import { customersGetExternal } from '@polar-sh/sdk/funcs/customersGetExternal.js'
import { customersList } from '@polar-sh/sdk/funcs/customersList.js'
import { customersUpdate } from '@polar-sh/sdk/funcs/customersUpdate.js'
import { membersListMembers } from '@polar-sh/sdk/funcs/membersListMembers.js'
import type { Auth } from 'convex/server'
import { type BillingContext, isProviderNotFound } from './context.js'
import type { PurchaseRules } from './purchase.js'
import type { ProviderCtx, RunQueryCtx, RunWriteCtx } from './types/base.js'
import type { BillingEntity, EntityProfile } from './types/setup.js'
import { backendError, getBackendError } from '../../errors.js'
import { logBackend } from '../../log.js'

// One provider customer per billing entity, keyed by the entity's id as the
// provider's external id. A workspace is a team customer named after it, with
// its owner as the owner member; a user (`billTo: 'user'`) is an individual
// customer. Members are never seats: the customer pays, its owner and billing
// managers reach the portal.

/** The member roles that may open a team customer's portal. */
const BILLING_MEMBER_ROLES = new Set(['owner', 'billing_manager'])

/** What the portal says to a workspace member the provider does not list as one who manages billing. */
const NOT_BILLING_MANAGER = 'Only the workspace owner manages its billing for now. Ask them to open the billing portal.'

/** What a `billTo: 'user'` checkout says when the account's email already pays for another account. */
const EMAIL_TAKEN = 'Your email already pays for another account. Check out with a different email, or ask the app\'s operator to move that billing profile.'

/** What a checkout says for an entity the component maps onto a customer another entity is keyed to. */
const MAPPING_TAKEN = 'This billing account is tied to another account\'s billing profile, from before billing gave each its own. Ask the app\'s operator to reset it.'

/**
 * How long a checkout that may start the owner's trial holds it: a provider
 * checkout session expires within it, so a hold this old was abandoned.
 */
const TRIAL_HOLD_MS = 60 * 60 * 1000

/** A provider refusal of a create that another request may have won: a 4xx other than "not found". */
function isConflict(error: unknown): boolean {
  const status = (typeof error === 'object' && error !== null ? (error as { statusCode?: unknown }).statusCode : undefined)
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 404
}

/** The signed-in caller behind a provider operation, as a member of the entity's customer. */
interface Caller {
  userId: string
  email: string
  /** Proven by a sign-in code: only then may the email stand for the caller. */
  emailVerified: boolean
  name?: string
}

/** The caller's own identity, read from the auth claims; `null` for a context with nobody signed in. */
async function callerOf(ctx: { auth?: Auth }): Promise<Caller | null> {
  const identity = await ctx.auth?.getUserIdentity()
  if (!identity) return null
  const claims = identity as unknown as Record<string, unknown>
  return {
    userId: identity.subject,
    email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '',
    emailVerified: claims.emailVerified === true,
    ...(typeof claims.name === 'string' && claims.name ? { name: claims.name } : {}),
  }
}

/** Find, create and map the provider customer of each billing entity; open its portal. */
export function createCustomers(
  { billTo, provider, providerLib, cache, requireEntity, requireProviderAccess, unwrapProvider, throttle, customerOwner }: BillingContext,
  { requireTrustedUrl }: PurchaseRules,
) {
  /** The provider customer the component maps this entity to, or `null`. */
  const mappedCustomer = async (ctx: RunQueryCtx, entityId: string): Promise<string | null> =>
    (await provider.getCustomerByUserId(ctx as unknown as ProviderCtx, entityId))?.id ?? null

  /** A workspace entity's name, owner and owned workspaces; `null` with `billTo: 'user'` or for an id that is no workspace. */
  const profileOf = async (ctx: RunQueryCtx, entityId: string): Promise<EntityProfile | null> =>
    billTo === 'organization' ? await ctx.runQuery(cache.entityProfile, { entityId }) : null

  /** The provider customer that already carries the entity's id as its external id, or `null`. */
  const customerByExternalId = async (entityId: string, operation: string): Promise<{ id: string } | null> => {
    const found = await customersGetExternal(provider.polar, { externalId: entityId })
    if (!found.ok && isProviderNotFound(found.error)) return null
    return unwrapProvider(found, operation)
  }

  /**
   * An earlier customer of this email that may become the entity's: one no
   * entity keyed or tagged (the provider makes those for a checkout that
   * named no customer), or one already tagged with this entity. Anything
   * else belongs to someone, and `taken` says so.
   */
  const adoptable = async (ctx: RunWriteCtx, email: string, entityId: string, operation: string) => {
    const listed = unwrapProvider(await customersList(provider.polar, { email, limit: 1 }), operation)
    const found = listed.result.items[0]
    if (!found) return { customer: null, taken: false }
    const owner = found.externalId ?? await customerOwner(ctx, found)
    if (owner === null || owner === entityId) return { customer: found, taken: false }
    return { customer: null, taken: true }
  }

  /** Key an earlier customer to the entity: its external id, the entity tag, and for a workspace the team type and name. */
  const adopt = async (
    customer: { id: string, metadata: Record<string, string | number | boolean> },
    entityId: string,
    team: { name: string } | null,
    operation: string,
  ): Promise<string> => {
    const updated = await customersUpdate(provider.polar, {
      id: customer.id,
      customerUpdate: {
        externalId: entityId,
        metadata: { ...customer.metadata, userId: entityId },
        // The provider upgrades an individual customer to a team, never back.
        ...(team ? { type: 'team' as const, name: team.name } : {}),
      },
    })
    return unwrapProvider(updated, operation).id
  }

  /**
   * Create the entity's customer: a team owned by the workspace owner, or an
   * individual with the user's email. The provider's answer comes back as is,
   * so a refused create can be told apart from one another request won.
   */
  const create = async (entity: BillingEntity, profile: EntityProfile | null, caller: Caller | null) => {
    const metadata = { userId: entity.userId }
    if (billTo === 'user') {
      return await customersCreate(provider.polar, { email: entity.email, externalId: entity.userId, metadata })
    }
    // An app's own resolver may name an entity that is no workspace: its
    // owner member is the caller who first pays for it.
    const owner = profile?.owner ?? (caller ? { userId: caller.userId, email: caller.email || entity.email, name: caller.name ?? null } : null)
    if (!owner?.email) {
      throw backendError('not_ready', { reason: 'no_customer' }, '[nuxt-backend] Billing: this workspace has no owner with an email to own its billing customer.')
    }
    return await customersCreate(provider.polar, {
      type: 'team',
      externalId: entity.userId,
      ...(profile?.name ? { name: profile.name } : {}),
      owner: { email: owner.email, name: owner.name || null, externalId: owner.userId },
      metadata,
    })
  }

  /**
   * The email whose earlier customer an entity may take over: a user's own,
   * or a personal workspace owner's — only one its owner proved by a sign-in
   * code, and never for a shared workspace.
   */
  const adoptableEmail = (entity: BillingEntity, profile: EntityProfile | null, caller: Caller | null): string | null => {
    if (billTo === 'user') return caller?.emailVerified && caller.email === entity.email.toLowerCase() ? entity.email : null
    return profile?.personal && profile.owner?.emailVerified ? profile.owner.email : null
  }

  /**
   * The first customer of an entity no customer is keyed to yet: an earlier
   * one adopted (a personal workspace or a user only), else a new one, or
   * the one another request created a moment earlier.
   */
  const firstCustomer = async (ctx: RunWriteCtx & { auth?: Auth }, entity: BillingEntity, profile: EntityProfile | null, operation: string): Promise<string> => {
    const caller = await callerOf(ctx)
    const adoptEmail = adoptableEmail(entity, profile, caller)
    const earlier = adoptEmail ? await adoptable(ctx, adoptEmail, entity.userId, operation) : null
    if (earlier?.taken && billTo === 'user') {
      // An individual customer's email is unique at the provider: another account's keeps it.
      throw backendError('forbidden', { reason: 'customer_taken', message: EMAIL_TAKEN }, EMAIL_TAKEN)
    }
    if (earlier?.customer) return await adopt(earlier.customer, entity.userId, profile ? { name: profile.name } : null, operation)
    const created = await create(entity, profile, caller)
    const raced = !created.ok && isConflict(created.error) ? await customerByExternalId(entity.userId, operation) : null
    return raced?.id ?? unwrapProvider(created, operation).id
  }

  /**
   * Key a customer the component maps an entity to, once: a customer
   * created before 0.2 carries no external id, and every live read goes by
   * it. One already keyed to another entity was shared between the two by
   * the old email lookup, and is refused (`forbidden`, reason
   * `customer_taken`) until the operator resets it.
   */
  const keyMapped = async (customerId: string, entityId: string, operation: string): Promise<string> => {
    const customer = unwrapProvider(await customersGet(provider.polar, { id: customerId }), operation)
    if (customer.externalId === entityId) return customerId
    if (customer.externalId) {
      logBackend('error', 'billing.customer_mapping_shared', 'A billing entity is mapped onto a customer keyed to another entity; it is refused until the deployment\'s billing data is reset.')
      throw backendError('forbidden', { reason: 'customer_taken', message: MAPPING_TAKEN }, MAPPING_TAKEN)
    }
    const keyed = await customersUpdate(provider.polar, {
      id: customerId,
      customerUpdate: { externalId: entityId, metadata: { ...customer.metadata, userId: entityId } },
    })
    return unwrapProvider(keyed, operation).id
  }

  /**
   * Whether an entity has a customer its live reads find by its id: the one
   * the component maps it to, keyed now when it predates 0.2. `false` when
   * it has none, or when that customer is keyed to another entity (shared by
   * the old email lookup), so a read shows nothing of another entity's.
   */
  const keyedCustomer = async (ctx: RunQueryCtx, entityId: string, operation: string): Promise<boolean> => {
    const mapped = await mappedCustomer(ctx, entityId)
    if (!mapped) return false
    try {
      await keyMapped(mapped, entityId, operation)
      return true
    }
    catch (error) {
      if (getBackendError(error)?.code === 'forbidden') return false
      throw error
    }
  }

  /**
   * The provider customer of a billing entity, found or created, and mapped
   * in the component so the synced subscriptions read back for it. Never
   * matched by email: in workspace mode one person's email stands behind
   * several workspaces, and each pays through a customer of its own.
   *
   * 1. The component's mapping, when the entity was seen before, keyed by
   *    the entity's id on first touch when it predates 0.2.
   * 2. The customer keyed by the entity's id (created by an earlier run, or
   *    by a provider checkout that named the external id).
   * 3. An earlier, unkeyed customer of the owner's verified email — only for
   *    a personal workspace or a user entity, never a shared workspace.
   * 4. A new one. Two first checkouts at once race to create it: the
   *    provider keeps the external id unique, so the loser reads the winner's.
   */
  const ensureCustomer = async (
    ctx: RunWriteCtx & { auth?: Auth },
    entity: BillingEntity,
    profile: EntityProfile | null,
    operation: string,
  ): Promise<string> => {
    const mapped = await mappedCustomer(ctx, entity.userId)
    if (mapped) return await keyMapped(mapped, entity.userId, operation)
    const customerId = (await customerByExternalId(entity.userId, operation))?.id
      ?? await firstCustomer(ctx, entity, profile, operation)
    await ctx.runMutation(providerLib.insertCustomer, { id: customerId, userId: entity.userId })
    return customerId
  }

  /** The person whose one trial an entity's checkout spends: the workspace's owner, the user, or the caller who pays. */
  const trialOwner = async (ctx: { auth?: Auth }, entityId: string, profile: EntityProfile | null): Promise<string | null> =>
    profile?.owner?.userId ?? (billTo === 'user' ? entityId : (await callerOf(ctx))?.userId ?? null)

  /**
   * Whether a checkout for this entity may offer a trial: one trial per
   * owner, across every workspace they own and whatever becomes of them. No
   * when a subscription of a workspace the owner owns had one, or when the
   * component records a trial of theirs (kept by their user id, so deleting
   * or handing over the trialed workspace changes nothing). A yes for a
   * checkout that `offers` a trial holds it for this entity in the same
   * transaction, so two first checkouts of the owner's workspaces at once
   * can't both start one.
   */
  const trialAllowed = async (ctx: RunWriteCtx & { auth?: Auth }, entityId: string, profile: EntityProfile | null, offers: boolean): Promise<boolean> => {
    for (const id of profile?.ownedEntityIds ?? [entityId]) {
      const subscriptions = await provider.listAllUserSubscriptions(ctx as unknown as ProviderCtx, { userId: id })
      if (subscriptions.some(subscription => subscription.trialStart != null)) return false
    }
    // A checkout that offers no trial has none to hold.
    const owner = offers ? await trialOwner(ctx, entityId, profile) : null
    if (!owner) return true
    return await ctx.runMutation(cache.claimTrial, { ownerUserId: owner, entityId, holdMs: TRIAL_HOLD_MS })
  }

  /** Record that an entity's subscription started its owner's trial, from a webhook. */
  const recordTrial = async (ctx: RunWriteCtx, entityId: string): Promise<void> => {
    const owner = billTo === 'user' ? entityId : (await profileOf(ctx, entityId))?.owner?.userId
    if (owner) await ctx.runMutation(cache.markTrialUsed, { ownerUserId: owner, entityId })
  }

  /**
   * The caller's member of a team customer, when it may open the portal: the
   * member keyed by the caller's user id, else the one carrying the caller's
   * email (an adopted customer's owner member has no external id, and the
   * provider sets none after the fact). Sign-in proves that email by code.
   */
  const billingMemberOf = async (ctx: { auth?: Auth }, customerId: string): Promise<string> => {
    const caller = await callerOf(ctx)
    const listed = unwrapProvider(await membersListMembers(provider.polar, { customerId, limit: 100 }), 'portal session')
    const members = listed.result.items
    // By email only for a member no account is keyed to (an adopted
    // customer's owner), and only for an email the caller proved by code.
    const member = members.find(entry => caller && entry.externalId === caller.userId)
      ?? members.find(entry => caller?.emailVerified && caller.email && entry.externalId == null && entry.email.toLowerCase() === caller.email)
    if (member && BILLING_MEMBER_ROLES.has(String(member.role))) return member.id
    throw backendError('forbidden', { reason: 'not_billing_manager', message: NOT_BILLING_MANAGER }, `[nuxt-backend] ${NOT_BILLING_MANAGER}`)
  }

  /**
   * A customer-portal session for the caller's billing entity, scoped to the
   * caller's own member of a workspace's team customer, so the portal shows
   * who is signed in and what that member may do. A workspace member the
   * provider does not list as the owner or a billing manager is refused
   * (`forbidden`, reason `not_billing_manager`); an entity that never paid has
   * no customer yet (`not_ready`, reason `no_customer`).
   */
  const portal = async (ctx: RunWriteCtx & { auth?: Auth }, options: { returnUrl?: string } = {}): Promise<{ url: string }> => {
    const { userId } = await requireEntity(ctx)
    requireProviderAccess('portal session')
    requireTrustedUrl(options.returnUrl, 'returnUrl')
    await throttle(ctx, userId, 'portal sessions')
    const customerId = await mappedCustomer(ctx, userId)
    if (!customerId) {
      throw backendError('not_ready', { reason: 'no_customer' }, '[nuxt-backend] No billing customer yet — the portal opens after a first checkout.')
    }
    const memberId = billTo === 'organization' ? await billingMemberOf(ctx, customerId) : undefined
    const session = await customerSessionsCreate(provider.polar, {
      customerId,
      ...(memberId ? { memberId } : {}),
      ...(options.returnUrl ? { returnUrl: options.returnUrl } : {}),
    })
    return { url: unwrapProvider(session, 'portal session').customerPortalUrl }
  }

  return { mappedCustomer, profileOf, ensureCustomer, keyMapped, keyedCustomer, trialAllowed, recordTrial, portal }
}

/** The customer functions of one `setupBilling` call. */
export type BillingCustomers = ReturnType<typeof createCustomers>
