import { ConvexError } from 'convex/values'

/**
 * The readable part of a failed call: a `ConvexError`'s own message (the
 * backend's refusals), else the error's message, else the fallback.
 */
export function errorText(cause: unknown, fallback: string): string {
  if (cause instanceof ConvexError && typeof cause.data === 'string') return cause.data
  return cause instanceof Error ? cause.message : fallback
}
