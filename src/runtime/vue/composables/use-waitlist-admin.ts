import type { DefaultFunctionArgs, FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject, type MaybeRefOrGetter, toValue } from 'vue'
import { ConvexAuthStateKey, useAction, useMutation } from 'nuxt-convex-module/client'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, diagnostics, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import type { WaitlistApiRefs, WaitlistCaps, WaitlistConsole } from './use-waitlist'
import type { WaitlistStatus } from '../../../convex/waitlist-rules'

export type { WaitlistCaps, WaitlistConsole, WaitlistEntryRow } from './use-waitlist'
export type { WaitlistStatus } from '../../../convex/waitlist-rules'

/** What the Waitlist tab narrows its list by; an empty field narrows nothing. */
export interface WaitlistFilter {
  /** The status listed; `waiting` by default. */
  status?: WaitlistStatus
  domain?: string
  source?: string
  /** The question and the choice an answer must be: both or neither. */
  question?: string
  answer?: string
}

export interface UseWaitlistAdminOptions {
  /** Override the injected `api.waitlist` namespace. */
  api?: WaitlistApiRefs
  /** What to narrow the list by, live. */
  filter?: MaybeRefOrGetter<WaitlistFilter>
}

export interface UseWaitlistAdminReturn {
  /** The Waitlist tab's data, live. `null` for a caller who is no administrator, `undefined` while it is read. */
  console: ComputedRef<WaitlistConsole | null | undefined>
  /** `true` while it is first read. */
  isLoading: ComputedRef<boolean>
  /** `true` once the read answered that this caller is no administrator. */
  isRefused: ComputedRef<boolean>
  /** `true` while a change is saved. */
  isPending: ComputedRef<boolean>
  /** Why the last change failed, else why the read failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Admit entries by id, or the next `next` in line; each gets one "You're in" email. Takes a recent sign-in. Rejects on failure. */
  admit: (input: { ids: string[] } | { next: number }) => Promise<number>
  /** Decline entries; `abuse` removes them as abuse and takes back what they gave friends. Takes a recent sign-in. Rejects on failure. */
  decline: (ids: string[], options?: { abuse?: boolean }) => Promise<number>
  /** Keep a note on an entry. Takes a recent sign-in. Rejects on failure. */
  note: (id: string, note: string) => Promise<void>
  /** The room a wave has: the sign-in codes left this hour and the email plan's quota today. `null` for no administrator. Rejects on failure. */
  caps: () => Promise<WaitlistCaps | null>
}

/**
 * The admin console's Waitlist tab, as data: the waiting people (the oldest
 * first, narrowed by a filter) with a count per status, and the changes an
 * administrator makes, through `backend/waitlist.ts`. Every change is an
 * administrator's in person and takes a recent sign-in
 * (`useReauthentication().withReauthentication` asks for one).
 */
export function useWaitlistAdmin(options: UseWaitlistAdminOptions = {}): UseWaitlistAdminReturn {
  const api = useBackendNamespace<WaitlistApiRefs>('waitlist', 'useWaitlistAdmin', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const filter = computed(() => Object.fromEntries(Object.entries(toValue(options.filter) ?? {}).filter(([, value]) => typeof value === 'string' && value.trim())) as WaitlistFilter)
  const read = api.getWaitlistConsole ? useLiveQuery(api.getWaitlistConsole, () => (signedOut.value ? 'skip' : filter.value)) : absentQuery<WaitlistConsole | null>()
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  const call = <A extends DefaultFunctionArgs, R>(ref: FunctionReference<'mutation', 'public', A, R> | undefined, name: string) => {
    if (!ref && diagnostics.enabled) console.warn(`[nuxt-backend] useWaitlistAdmin(): the backend exports no \`${name}\`: re-export it from backend/waitlist.ts with the rest of \`waitlist.api\`.`)
    const mutate = ref ? useMutation(ref) : null
    return (args: A) => run(async () => {
      if (!mutate) throw new Error(`[nuxt-backend] The Waitlist tab needs \`${name}\` re-exported from setupWaitlist() in backend/waitlist.ts, or pass \`{ api }\` to useWaitlistAdmin().`)
      return await mutate(args as never) as R
    })
  }
  const admit = call(api.admitWaitlist, 'admitWaitlist')
  const decline = call(api.declineWaitlist, 'declineWaitlist')
  const note = call(api.noteWaitlist, 'noteWaitlist')
  const readCaps = api.getWaitlistCaps ? useAction(api.getWaitlistCaps) : null

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
    admit: async input => (await admit(input)).admitted,
    decline: async (ids, { abuse } = {}) => (await decline({ ids, ...(abuse ? { abuse } : {}) })).declined,
    note: async (id, text) => {
      await note({ id, note: text })
    },
    caps: () => run(async () => (readCaps ? await readCaps({}) : null), { silent: true }),
  }
}
