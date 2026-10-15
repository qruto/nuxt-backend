/**
 * Signing in and signing out are activity: each stamps the account's
 * `updatedAt`, which the idle sweep (retention.ts) reads once the session
 * row is gone. Without the stamp, an account that signed in, read its data
 * and signed out looked as idle as its last write, and so did one that last
 * changed a counter (an update leaves no new row behind).
 */

/** The part of Better Auth's hook context this needs. */
interface HookContext {
  context: { internalAdapter: { updateUser: (userId: string, data: Record<string, unknown>) => Promise<unknown> } }
}

/** Stamp the user as active now. A user being deleted takes its sessions with it: nothing to stamp then. */
export async function markActive(userId: string, ctx: HookContext | null | undefined): Promise<void> {
  try {
    await ctx?.context.internalAdapter.updateUser(userId, { updatedAt: new Date() })
  }
  catch {
    // The user row is already gone.
  }
}
