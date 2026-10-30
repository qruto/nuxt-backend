import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject } from 'vue'
import { ConvexAuthStateKey, useAction } from 'nuxt-convex-module/client'
import type { InboxConsole, InboxRow } from '../../../convex/integrations/inbound.js'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'

export type { InboxConsole, InboxRow } from '../../../convex/integrations/inbound.js'

/** The functions of `email.api` the Inbox tab reads and calls. */
export interface InboxApiRefs {
  getInboxConsole?: FunctionReference<'query', 'public', Record<string, never>, InboxConsole | null>
  replyToInbox?: FunctionReference<'action', 'public', { kind: 'contact' | 'inbound', id: string, text: string }, null>
}

export interface UseInboxAdminOptions {
  /** Override the injected `api.email` namespace. */
  api?: InboxApiRefs
}

export interface UseInboxAdminReturn {
  /** The Inbox tab's data, live. `null` for a caller who is no administrator, `undefined` while it is read. */
  console: ComputedRef<InboxConsole | null | undefined>
  /** `true` while it is first read. */
  isLoading: ComputedRef<boolean>
  /** `true` once the read answered that this caller is no administrator. */
  isRefused: ComputedRef<boolean>
  /** `true` while a reply is sent. */
  isPending: ComputedRef<boolean>
  /** Why the last reply failed, else why the read failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Answer a row of the support inbox: it goes out from the support address and stays on the thread. Takes a recent sign-in. Rejects on failure. */
  reply: (row: Pick<InboxRow, 'id' | 'kind'>, text: string) => Promise<void>
}

/**
 * The admin console's Inbox tab, as data: what people sent through the
 * contact form and by email (reply addresses, workspace addresses, the support
 * inbox), newest first, and the replies an administrator sends to the
 * support inbox's threads, through `backend/email.ts`. A reply is an
 * administrator's in person and takes a recent sign-in
 * (`useReauthentication().withReauthentication` asks for one).
 *
 * @experimental
 */
export function useInboxAdmin(options: UseInboxAdminOptions = {}): UseInboxAdminReturn {
  const api = useBackendNamespace<InboxApiRefs>('email', 'useInboxAdmin', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const read = api.getInboxConsole ? useLiveQuery(api.getInboxConsole, () => (signedOut.value ? 'skip' : {})) : absentQuery<InboxConsole | null>()
  const send = api.replyToInbox ? useAction(api.replyToInbox) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  return {
    console: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value) return null
      return read.data.value
    }),
    isLoading: computed(() => authLoading.value || (!signedOut.value && read.isLoading.value)),
    isRefused: computed(() => !signedOut.value && read.data.value === null),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : read.error.value)),
    reply: async (row, text) => {
      await run(async () => {
        if (!send) throw new Error('[nuxt-backend] The Inbox tab needs `replyToInbox` re-exported from setupEmail() in backend/email.ts (`export const { getInboxConsole, replyToInbox } = email.api`), or pass `{ api }` to useInboxAdmin().')
        await send({ kind: row.kind === 'contact' ? 'contact' : 'inbound', id: row.id, text })
      })
    },
  }
}
