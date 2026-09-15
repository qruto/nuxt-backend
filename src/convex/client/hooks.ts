import type { BetterAuthOptions } from 'better-auth/minimal'

/** Better Auth's `databaseHooks` option — one `before`/`after` pair per model and operation. */
export type DatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>

type HookOps = Record<string, { before?: AnyHook, after?: AnyHook } | undefined>
type AnyHook = (entity: Record<string, unknown>, context: unknown) => Promise<unknown>
type BeforeResult = false | undefined | { data: Record<string, unknown> }

/**
 * Compose the package's database hooks with a consumer's, so a consumer
 * `databaseHooks` extends the packaged behaviour (welcome email,
 * `onUserCreated`, the workspace session hook, the `canSignIn` gate) instead
 * of replacing it.
 *
 * For every model and operation:
 *
 * - `before` runs the package hook, then the consumer hook. Better Auth
 *   merges a `{ data }` return into the entity, so the consumer hook sees the
 *   entity as the package hook left it (e.g. the session with its
 *   `activeOrganizationId`). A `false` from either aborts the write; the
 *   composed hook then returns `false` without running the rest.
 * - `after` runs the package hook, then the consumer hook.
 *
 * A model or operation only one side declares passes through untouched.
 * Returns `undefined` when neither side declares anything.
 */
export function mergeDatabaseHooks(
  packageHooks: DatabaseHooks | undefined,
  consumerHooks: DatabaseHooks | undefined,
): DatabaseHooks | undefined {
  if (!packageHooks) return consumerHooks
  if (!consumerHooks) return packageHooks

  const ours = packageHooks as Record<string, HookOps | undefined>
  const theirs = consumerHooks as Record<string, HookOps | undefined>
  const merged: Record<string, HookOps> = {}
  for (const model of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    const ourOps = ours[model] ?? {}
    const theirOps = theirs[model] ?? {}
    const ops: HookOps = {}
    for (const op of new Set([...Object.keys(ourOps), ...Object.keys(theirOps)])) {
      const first = ourOps[op]
      const second = theirOps[op]
      ops[op] = {
        ...(first?.before || second?.before ? { before: chainBefore(first?.before, second?.before) } : {}),
        ...(first?.after || second?.after ? { after: chainAfter(first?.after, second?.after) } : {}),
      }
    }
    merged[model] = ops
  }
  return merged as DatabaseHooks
}

/** Run two `before` hooks in order, threading a `{ data }` transform and honouring a `false` abort. */
function chainBefore(first?: AnyHook, second?: AnyHook): AnyHook {
  return async (entity, context) => {
    let current = entity
    let transformed = false
    for (const hook of [first, second]) {
      if (!hook) continue
      const result = await hook(current, context) as BeforeResult
      if (result === false) return false
      if (result && typeof result === 'object' && 'data' in result) {
        current = { ...current, ...result.data }
        transformed = true
      }
    }
    return transformed ? { data: current } : undefined
  }
}

/** Run two `after` hooks in order. */
function chainAfter(first?: AnyHook, second?: AnyHook): AnyHook {
  return async (entity, context) => {
    await first?.(entity, context)
    await second?.(entity, context)
  }
}
