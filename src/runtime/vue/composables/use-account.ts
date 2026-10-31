import type { FunctionReference } from 'convex/server'
import { computed, inject, type ComputedRef } from 'vue'
import { ConvexAuthStateKey, useAction, useMutation } from 'nuxt-convex-module/client'
import type { AccountDeletion, AccountExport, AccountExportStatus } from '../../../convex/integrations/account'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { useAuthSession } from '../utils/auth-session'

export type { AccountDeletion, AccountExport, AccountExportStatus } from '../../../convex/integrations/account'

/** The export functions re-exported from your `backend/account.ts`. */
export interface AccountApi {
  exportAccountData?: FunctionReference<'action', 'public', Record<string, never>, AccountExport>
  getAccountExport?: FunctionReference<'query', 'public', Record<string, never>, AccountExportStatus | null>
  getAccountDeletion?: FunctionReference<'query', 'public', Record<string, never>, AccountDeletion | null>
  cancelAccountDeletion?: FunctionReference<'mutation', 'public', { token?: string }, boolean>
}

export interface UseAccountOptions {
  /** Override the injected `api.account` namespace. */
  api?: AccountApi
}

/** The profile fields `updateProfile` saves. */
export interface ProfileFields {
  /** The display name. */
  name?: string
  /** The avatar image URL, or `null` to remove it. */
  image?: string | null
  /** The language every email the package sends the account is written in: a language tag such as `de` or `pt-BR`. */
  locale?: string
}

export interface UseAccountReturn {
  /**
   * The newest export whose link still works, live: it turns `null` when
   * the link expires. `null` when there is none and when signed out;
   * `undefined` while the session or the export is still being read.
   */
  latestExport: ComputedRef<AccountExport | null | undefined>
  /**
   * How many more exports the account may make today (three a day); `0`
   * when signed out, `undefined` while it is read.
   */
  exportsLeft: ComputedRef<number | undefined>
  /**
   * What the person types to confirm a deletion: the account's own
   * address, as `deleteAccount` checks it. `''` when signed out.
   */
  confirmation: ComputedRef<string>
  /** `true` while the session or the export is still being read. */
  isLoading: ComputedRef<boolean>
  /**
   * The deletion waiting out its grace period, live: `{ requestedAt,
   * deletesAt }` (epoch ms), or `null` when none is scheduled and when
   * signed out; `undefined` while it is read. The account works as before
   * until `deletesAt`; `cancelDeletion()` keeps it.
   */
  deletion: ComputedRef<AccountDeletion | null | undefined>
  /** `true` while `updateProfile`, `exportData`, `deleteAccount` or `cancelDeletion` runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, else why the export could not be read, else `null`. Reads never reject. */
  error: ComputedRef<BackendError | null>
  /**
   * Save the account's profile: its name, its avatar and its language. Never
   * the email address (`useEmailChange` moves the account, with a code from
   * each address); a language tag that is not one is refused. Rejects on
   * failure.
   */
  updateProfile: (fields: ProfileFields) => Promise<void>
  /**
   * Export everything the app keeps of the account into one JSON file,
   * behind a link that expires within the hour; resolves with it. At most
   * three a day (`rate_limited`, limit `accountExport`), and never for an
   * administrator acting as the account (`forbidden`, reason
   * `impersonating`). Rejects on failure.
   */
  exportData: () => Promise<AccountExport>
  /**
   * Schedule the account's deletion: `confirmation` is the address the
   * person typed. The account works as before for the grace period, an
   * email tells the person the date and carries a link that keeps the
   * account, and `deletion` holds the date. Then the account is erased
   * everywhere. It takes a recent sign-in (wrap it in
   * `useReauthentication().withReauthentication`), and is refused to the
   * only owner of a workspace others belong to (`forbidden`, reason
   * `sole_owner`). Rejects on failure.
   */
  deleteAccount: (confirmation: string) => Promise<void>
  /**
   * Keep the account: cancel its scheduled deletion. A second email
   * confirms. Resolves with whether a deletion was cancelled. Rejects on
   * failure.
   */
  cancelDeletion: () => Promise<boolean>
}

/**
 * The account itself: its profile, its export and its deletion. Save the
 * name, the avatar and the language with `updateProfile`; download
 * everything the app keeps of the account, and delete it for good. The
 * export runs `exportAccountData` from `backend/account.ts`, and the newest
 * export's link is a live query over `getAccountExport`, so it disappears
 * the moment it expires. The deletion is scheduled, once the person typed
 * their address (`confirmation`) and signed in recently: `deletion` holds
 * when it happens, `cancelDeletion()` keeps the account, and when the grace
 * period ends an erasure removes the account's data everywhere, the billing
 * and email providers included.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const account = useAccount()
 * const { withReauthentication } = useReauthentication()
 * const typed = ref('')
 * </script>
 * <template>
 *   <a v-if="account.latestExport.value" :href="account.latestExport.value.url">Download</a>
 *   <button :aria-disabled="account.isPending.value || undefined" @click="account.exportData()">Export my data</button>
 *   <p v-if="account.deletion.value">Deleted on {{ new Date(account.deletion.value.deletesAt).toLocaleDateString() }}</p>
 *   <button v-if="account.deletion.value" @click="account.cancelDeletion()">Keep my account</button>
 *   <input v-model="typed" :placeholder="account.confirmation.value">
 *   <button @click="withReauthentication(() => account.deleteAccount(typed))">Delete my account</button>
 * </template>
 * ```
 */
export function useAccount(options: UseAccountOptions = {}): UseAccountReturn {
  const api = useBackendNamespace<AccountApi>('account', 'useAccount', options.api)
  const auth = useAuthSession()
  const state = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => state == null || !state.isAuthenticated.value)
  const authLoading = computed(() => state != null && state.isLoading.value)

  const read = api.getAccountExport
    ? useLiveQuery(api.getAccountExport, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<AccountExportStatus | null>()
  const readDeletion = api.getAccountDeletion
    ? useLiveQuery(api.getAccountDeletion, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<AccountDeletion | null>()
  const runExport = api.exportAccountData ? useAction(api.exportAccountData) : null
  const runCancel = api.cancelAccountDeletion ? useMutation(api.cancelAccountDeletion) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  return {
    latestExport: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value || !api.getAccountExport) return null
      const status = read.data.value
      return status === undefined ? undefined : status?.latest ?? null
    }),
    exportsLeft: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value || !api.getAccountExport) return 0
      const status = read.data.value
      return status === undefined ? undefined : status?.remaining ?? 0
    }),
    confirmation: computed(() => {
      const email = (auth.user.value as { email?: unknown } | null | undefined)?.email
      return typeof email === 'string' ? email : ''
    }),
    deletion: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value || !api.getAccountDeletion) return null
      return readDeletion.data.value
    }),
    isLoading: computed(() => authLoading.value || (!signedOut.value && (read.isLoading.value || readDeletion.isLoading.value))),
    isPending,
    error: computed(() => (signedOut.value ? null : failure.value ?? read.error.value ?? readDeletion.error.value)),
    // Silent here: the session's own run already told the `backend:error` hook.
    updateProfile: fields => run(() => auth.updateUser(fields), { silent: true }),
    exportData: () => run(async () => {
      if (!runExport) {
        throw new Error('[nuxt-backend] Exporting needs `exportAccountData` re-exported from setupAccount() in backend/account.ts, or pass `{ api }` to useAccount().')
      }
      return await runExport({})
    }),
    // Silent here too.
    deleteAccount: confirmation => run(() => auth.deleteAccount(confirmation), { silent: true }),
    cancelDeletion: () => run(async () => {
      if (!runCancel) {
        throw new Error('[nuxt-backend] Keeping an account needs `cancelAccountDeletion` re-exported from setupAccount() in backend/account.ts, or pass `{ api }` to useAccount().')
      }
      return await runCancel({})
    }),
  }
}
