import { computed, type ComputedRef, type Ref } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { type HumanCheckMode, humanToken, modeOf } from '../protection/state'

export type { HumanCheckMode } from '../protection/state'

export interface UseHumanCheckReturn {
  /**
   * How this browser proves it is a person: `challenge` (a widget that asks
   * for a click only when it must, wherever the app has a site key; on
   * Vercel BotID checks too), `detection` (BotID's invisible check alone,
   * on Vercel), or `off`.
   */
  mode: ComputedRef<HumanCheckMode>
  /** `true` while a token is on its way. */
  isPending: ComputedRef<boolean>
  /** Why the last token was refused (`forbidden`, reason `bot_check`), or `null`. */
  error: Ref<BackendError | null>
  /**
   * A token for one call of `action` (up to 32 letters, digits, `_` and
   * `-`), for `verifyHuman(ctx, token, { action, subject })` on the
   * deployment: a proof the app's server signs once its bot check passed
   * (on Vercel), bound to `subject` when one is named (the address a
   * waitlist join gives, say: up to 320 characters, read without case), or
   * else to this browser (an HttpOnly visitor cookie the route sets, which
   * `jobs.enqueue` counts a signed-out visitor's guest jobs by), or a
   * challenge answer. Resolves `null` when the app checks nobody: the
   * deployment then takes the call without one. Rejects when the check
   * fails.
   */
  token: (action: string, subject?: string) => Promise<string | null>
}

/**
 * Proof that a person makes a call: the client half of `verifyHuman`, for
 * the calls that reach the deployment over the live connection and never
 * pass through the app's server (a waitlist join, a contact form, a
 * referral claim). Ask for a token right before the call, pass it along,
 * and let the function check it, in an action: a challenge answer is
 * verified with the provider, which only an action can call. A token is
 * good for one action, and a proof for a minute.
 *
 * The sign-in code request needs none of this: the auth client answers the
 * check on its own.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { api } from '#backend/api'
 *
 * const join = useAction(api.waitlist.join)
 * const { token, error } = useHumanCheck()
 *
 * async function submit(email: string) {
 *   await join({ email, human: await token('waitlist', email) })
 * }
 * </script>
 * ```
 */
export function useHumanCheck(): UseHumanCheckReturn {
  const { isPending, failure, run } = useActionState()
  // From the runtime config, the same on the server render and in the browser.
  const config = useRuntimeConfig().public.backend as { botDetection?: boolean, challengeSiteKey?: string } | undefined
  return {
    mode: computed(() => modeOf(config)),
    isPending,
    error: failure,
    token: (action, subject) => run(() => humanToken(action, subject)),
  }
}
