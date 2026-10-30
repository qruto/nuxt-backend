import { computed, getCurrentInstance, onMounted, ref, type ComputedRef } from 'vue'
import { type Passkey, type RegisterPasskeyOptions, useAuthSession } from '../utils/auth-session'
import { unwrapAuth } from '../utils/auth-result'
import { preloadPasskeyCeremony } from '../passkey-client'
import { useActionState } from '../utils/action-state'
import { type BackendError, failureOf } from '../utils/backend-error'
import { clientCapabilities, type PasskeyCapabilities, signalAcceptedCredentials } from '../utils/passkey-signals'

export type { Passkey, RegisterPasskeyOptions } from '../utils/auth-session'
export type { PasskeyCapabilities } from '../utils/passkey-signals'

export interface UsePasskeysOptions {
  /** Load the passkey list on mount. Default `true`. */
  immediate?: boolean
}

export interface UsePasskeysReturn {
  /** The user's passkeys — `undefined` until the first (client-only) load lands, and after a failed one. */
  passkeys: ComputedRef<Passkey[] | undefined>
  /** `true` while the list loads. */
  isLoading: ComputedRef<boolean>
  /** `true` while `add`, `rename` or `remove` runs. */
  isPending: ComputedRef<boolean>
  /**
   * Why the last action failed, else why the list could not be loaded, else
   * `null`. An action clears its own failure when the next one starts, and
   * signing out clears it.
   */
  error: ComputedRef<BackendError | null>
  /** Reload the list. A load never rejects: a failed one shows in `error`. */
  refresh: () => Promise<void>
  /** Save a passkey on this device, then reload. Resolves with the passkey; rejects on failure, a cancelled prompt included. */
  add: (options?: RegisterPasskeyOptions) => Promise<Passkey>
  /** Rename a passkey, then reload. Rejects on failure. */
  rename: (id: string, name: string) => Promise<void>
  /** Remove a passkey, then reload. Rejects on failure; the last passkey of a passkey-only account is refused (`invalid_input` on `passkeys`). */
  remove: (id: string) => Promise<void>
  /**
   * What the browser's `getClientCapabilities()` reported (`conditionalGet`,
   * `hybridTransport`, `passkeyPlatformAuthenticator`, …), or `null` before
   * it answers, on the server, and in a browser without it.
   */
  capabilities: ComputedRef<PasskeyCapabilities | null>
  /** `true` while the account refuses sign-in codes and signs in with passkeys only. */
  passkeyOnly: ComputedRef<boolean>
  /**
   * Turn sign-in codes off for the account (`true`) or on again (`false`).
   * Takes a recent sign-in and refuses an administrator's visit. Turning it
   * on needs a passkey and resolves with `{ recoveryCode }`, shown once;
   * turning it on again issues a new code, and the old one stops working.
   * Turning it off resolves with `{ recoveryCode: null }`. Rejects on failure.
   */
  setPasskeyOnly: (on: boolean) => Promise<{ recoveryCode: string | null }>
}

/**
 * Passkey management over the auth client — list, register, rename, remove.
 * Loading the list is a read: it never rejects, and a failed load shows in
 * `error`. The actions resolve, or reject with an `Error` carrying the
 * server's message (the client's error as its `cause`), and keep the
 * failure in `error`. The list only loads in the browser (WebAuthn and
 * the session cookie live there), starting as `undefined` during SSR.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { passkeys, add, remove, isPending, error } = usePasskeys()
 * </script>
 * <template>
 *   <p v-if="error">{{ error.message }}</p>
 *   <ul>
 *     <li v-for="passkey in passkeys" :key="passkey.id">
 *       {{ passkey.name ?? 'Unnamed passkey' }}
 *       <button :aria-disabled="isPending || undefined" @click="isPending || remove(passkey.id)">Remove</button>
 *     </li>
 *   </ul>
 *   <button :aria-disabled="isPending || undefined" @click="isPending || add()">Add a passkey</button>
 * </template>
 * ```
 */
export function usePasskeys(options: UsePasskeysOptions = {}): UsePasskeysReturn {
  const auth = useAuthSession()
  const { client } = auth

  const list = ref<Passkey[] | undefined>()
  const loads = ref(0)
  const loadFailure = ref<BackendError | null>(null)
  const signedOut = () => !auth.isLoading.value && !auth.isAuthenticated.value
  const { isPending, failure, run } = useActionState(signedOut)

  const capabilities = ref<PasskeyCapabilities | null>(null)
  const userOf = () => auth.user.value as { id: string, email: string, passkeyOnly?: boolean | null } | null | undefined

  async function refresh(): Promise<void> {
    loads.value++
    loadFailure.value = null
    try {
      list.value = unwrapAuth<Passkey[] | null>(await client.passkey.listUserPasskeys()) ?? []
      // The device keeps only the passkeys the account still holds (the WebAuthn Signal API).
      const user = userOf()
      if (user) void signalAcceptedCredentials(user.id, list.value.flatMap(passkey => (passkey.credentialID ? [passkey.credentialID] : [])))
    }
    catch (cause) {
      list.value = undefined
      loadFailure.value = failureOf(cause)
    }
    finally {
      loads.value--
    }
  }

  if (getCurrentInstance()) {
    // Loaded before `add` is tapped, which then opens the prompt in its own task.
    onMounted(preloadPasskeyCeremony)
    onMounted(async () => {
      capabilities.value = await clientCapabilities()
    })
    if (options.immediate ?? true) onMounted(refresh)
  }

  return {
    passkeys: computed(() => list.value),
    isLoading: computed(() => loads.value > 0),
    isPending,
    error: computed(() => (signedOut() ? null : failure.value ?? loadFailure.value)),
    refresh,
    add: added => run(async () => {
      const passkey = await auth.registerPasskey(added)
      await refresh()
      return passkey
    }),
    rename: (id, name) => run(async () => {
      unwrapAuth(await client.passkey.updatePasskey({ id, name }))
      await refresh()
    }),
    remove: id => run(async () => {
      unwrapAuth(await client.passkey.deletePasskey({ id }))
      await refresh()
    }),
    capabilities: computed(() => capabilities.value),
    passkeyOnly: computed(() => userOf()?.passkeyOnly === true),
    setPasskeyOnly: on => run(async () => {
      const answer = await auth.setPasskeyOnly(on)
      await auth.session.value.refetch()
      return answer
    }),
  }
}
