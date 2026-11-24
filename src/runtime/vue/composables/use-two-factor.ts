import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useAuthSession } from '../utils/auth-session'
import { unwrapAuth } from '../utils/auth-result'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'

/** What turning the authenticator app on hands back, before its first code confirms it. */
export interface TwoFactorSetup {
  /** The `otpauth://` link an authenticator app reads (as a QR code, or opened on the same device). */
  totpURI: string
  /** The key in the link, for an app that takes it typed. */
  secret: string
  /** Ten codes that each stand in for the app once: shown now, then never again. */
  backupCodes: string[]
}

export interface UseTwoFactorReturn {
  /** `true` once the account asks for the app's code after its sign-in code. */
  enabled: ComputedRef<boolean>
  /** The setup `start` answered, waiting for `confirm`; `null` otherwise. */
  pendingSetup: Ref<TwoFactorSetup | null>
  /** `true` while an action runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, or `null`. The next action clears it, and so does signing out. */
  error: ComputedRef<BackendError | null>
  /**
   * Begin turning the app on: a new secret and new backup codes, in
   * `pendingSetup`. Nothing asks for the app until `confirm` checks its
   * first code. Takes a recent sign-in and refuses an administrator's visit.
   */
  start: () => Promise<TwoFactorSetup>
  /** Check the app's first code and turn the step on. Rejects with `invalid_input` on `twoFactorCode` for a wrong one. */
  confirm: (code: string) => Promise<void>
  /** Turn the app off: sign-in codes and passkeys sign in alone again. Takes a recent sign-in. */
  disable: () => Promise<void>
  /** New backup codes in place of the old ones, which stop working. Takes a recent sign-in. */
  regenerateBackupCodes: () => Promise<string[]>
}

/** The key an `otpauth://` link carries. */
function secretOf(totpURI: string): string {
  try {
    return new URL(totpURI).searchParams.get('secret') ?? ''
  }
  catch {
    return ''
  }
}

/**
 * The authenticator app as a second step after a sign-in code (TOTP), for
 * the signed-in account: turn it on (`start`, then `confirm` with the
 * app's first code), off, and new backup codes. A passkey sign-in asks for
 * no second step: the passkey is one already. `<SecuritySettings>`
 * renders all of it; wrap the actions in
 * `useReauthentication().withReauthentication` when building your own.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const twoFactor = useTwoFactor()
 * const { withReauthentication } = useReauthentication()
 * const code = ref('')
 * </script>
 * <template>
 *   <button v-if="!twoFactor.enabled.value" @click="withReauthentication(twoFactor.start)">Use an authenticator app</button>
 *   <form v-if="twoFactor.pendingSetup.value" @submit.prevent="twoFactor.confirm(code)">
 *     <a :href="twoFactor.pendingSetup.value.totpURI">Open in your app</a>
 *     <input v-model="code" autocomplete="one-time-code">
 *   </form>
 * </template>
 * ```
 */
export function useTwoFactor(): UseTwoFactorReturn {
  const auth = useAuthSession()
  const { client } = auth
  const signedOut = () => !auth.isLoading.value && !auth.isAuthenticated.value
  const { isPending, failure, run } = useActionState(signedOut)
  const pendingSetup = ref<TwoFactorSetup | null>(null)
  // A setup belongs to the account that started it: another account, or none, drops it.
  const account = () => (auth.user.value as { id?: string } | null | undefined)?.id ?? null
  watch(account, () => {
    pendingSetup.value = null
  })

  return {
    enabled: computed(() => (auth.user.value as { twoFactorEnabled?: boolean | null } | null | undefined)?.twoFactorEnabled === true),
    pendingSetup,
    isPending,
    error: computed(() => (signedOut() ? null : failure.value)),
    start: () => run(async () => {
      const startedFor = account()
      const answer = unwrapAuth<{ totpURI: string, backupCodes: string[] }>(await client.twoFactor.enable({} as Parameters<typeof client.twoFactor.enable>[0]))
      const setup = { ...answer, secret: secretOf(answer.totpURI) }
      // An answer for an account no longer signed in here is not shown.
      if (account() === startedFor) pendingSetup.value = setup
      return setup
    }),
    confirm: code => run(async () => {
      unwrapAuth(await client.twoFactor.verifyTotp({ code: code.replace(/\s+/g, '') }))
      pendingSetup.value = null
      await auth.session.value.refetch()
    }),
    disable: () => run(async () => {
      unwrapAuth(await client.twoFactor.disable({} as Parameters<typeof client.twoFactor.disable>[0]))
      pendingSetup.value = null
      await auth.session.value.refetch()
    }),
    regenerateBackupCodes: () => run(async () => {
      const { backupCodes } = unwrapAuth<{ backupCodes: string[] }>(await client.twoFactor.generateBackupCodes({} as Parameters<typeof client.twoFactor.generateBackupCodes>[0]))
      return backupCodes
    }),
  }
}
