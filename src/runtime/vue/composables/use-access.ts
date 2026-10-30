import type { DefaultFunctionArgs, FunctionReference } from 'convex/server'
import { computed, inject, ref, type ComputedRef, type Ref } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import { useAsyncQuery } from 'nuxt-convex-module/app'
import type { AccessConsole, AccessPhaseState, AdmitResult } from '../../../convex/integrations/launch'
import type { AccessPhase, InviteKind, InviteStatus } from '../../../convex/access-tickets'
import { useActionState } from '../utils/action-state'
import { type BackendError, failureOf } from '../utils/backend-error'
import { forgetInvite, keepInvite, keptInvite, takeInviteFromAddress } from '../utils/kept-invite'
import { absentQuery, diagnostics, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'

export type { AccessConsole, AccessPhaseState, AdmitResult } from '../../../convex/integrations/launch'
export type { AccessPhase, InviteKind, InviteStatus } from '../../../convex/access-tickets'

/** The functions re-exported from your `backend/access.ts`. */
export interface AccessApiRefs {
  getAccessPhase?: FunctionReference<'query', 'public', Record<string, never>, AccessPhaseState>
  checkInvite?: FunctionReference<'mutation', 'public', { code: string }, { status: InviteStatus }>
  getAccessConsole?: FunctionReference<'query', 'public', Record<string, never>, AccessConsole | null>
  setAccessPhase?: FunctionReference<'mutation', 'public', { phase: AccessPhase }, null>
  createInvite?: FunctionReference<'mutation', 'public', { kind: InviteKind, label: string, maxUses: number, expiresAt?: number }, { id: string, code: string }>
  revokeInvite?: FunctionReference<'mutation', 'public', { id: string }, null>
  admitEmails?: FunctionReference<'mutation', 'public', { emails: string[], label?: string, email?: boolean }, AdmitResult>
}

export interface UseAccessPhaseOptions {
  /** Override the injected `api.access` namespace. */
  api?: AccessApiRefs
}

export interface UseAccessPhaseReturn {
  /** The app's launch phase, live: `'early-access'`, `'invite-only'` or `'public'`. `'public'` for an app without `backend/access.ts`. */
  phase: ComputedRef<AccessPhase | undefined>
  /** `true` once the app is public: anyone signs up. */
  isPublic: ComputedRef<boolean>
  /** `true` until the phase is first read. */
  isLoading: ComputedRef<boolean>
  /** Why the phase could not be read, else `null`. The read never throws. */
  error: ComputedRef<BackendError | null>
}

/**
 * The app's launch phase, so a page offers what a visitor can do now: join
 * the waitlist in early access, bring an invite code while invite only,
 * sign up once public. Rendered on the server, so the page never flashes
 * the open version before the closed one, and live after.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { phase } = useAccessPhase()
 * </script>
 * <template>
 *   <NuxtLink v-if="phase === 'invite-only'" to="/login">I have an invite</NuxtLink>
 * </template>
 * ```
 */
export function useAccessPhase(options: UseAccessPhaseOptions = {}): UseAccessPhaseReturn {
  const api = useBackendNamespace<AccessApiRefs>('access', 'useAccessPhase', options.api)
  if (!api.getAccessPhase) {
    return { phase: computed(() => 'public'), isPublic: computed(() => true), isLoading: computed(() => false), error: computed(() => null) }
  }
  const read = useAsyncQuery(api.getAccessPhase, {})
  const phase = computed(() => read.data.value?.phase)
  return {
    phase,
    isPublic: computed(() => phase.value === 'public'),
    isLoading: computed(() => read.data.value === undefined && read.error.value === null),
    error: computed(() => (read.error.value ? failureOf(read.error.value) : null)),
  }
}

export interface UseInviteOptions {
  /** Override the injected `api.access` namespace. */
  api?: AccessApiRefs
}

export interface UseInviteReturn {
  /**
   * Check an invite code or an access link's token, and keep it for this
   * tab while it is valid, so the next sign-in carries it. With no
   * argument, it reads an access link's token from the address's fragment
   * (`/invite#<token>`) and strips it from the address, or checks the one
   * this tab keeps. Never rejects: a failed check is in `error`, and keeps
   * the code for the next try; only an answer that it admits nobody drops it.
   */
  check: (codeOrToken?: string) => Promise<InviteStatus | null>
  /** How the last check came out: `valid`, `expired`, `used-up`, `revoked` or `unknown`; `null` before one. */
  status: Ref<InviteStatus | null>
  /** `true` while a check runs. */
  isPending: ComputedRef<boolean>
  /** Why the last check failed (a rate limit, say), else `null`. */
  error: ComputedRef<BackendError | null>
  /** Whether this tab keeps a valid code or token for its next sign-in. */
  isKept: ComputedRef<boolean>
  /** Drop the kept code or token. */
  forget: () => void
}

/**
 * Redeem an invite code or an access link on a page of your own: check it
 * before anyone signs in, and keep it for the tab so the sign-in hands it
 * over with the code. The account's creation checks it again and counts
 * the use. The packaged `/invite` page is built on it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { check, status } = useInvite()
 * const code = ref('')
 * </script>
 * <template>
 *   <form @submit.prevent="check(code)"><input v-model="code"></form>
 *   <NuxtLink v-if="status === 'valid'" to="/login">Continue to sign in</NuxtLink>
 * </template>
 * ```
 */
export function useInvite(options: UseInviteOptions = {}): UseInviteReturn {
  const api = useBackendNamespace<AccessApiRefs>('access', 'useInvite', options.api)
  const runCheck = api.checkInvite ? useMutation(api.checkInvite) : null
  const { isPending, failure, run } = useActionState()
  const status = ref<InviteStatus | null>(null)
  const kept = ref(keptInvite() !== null)

  const check: UseInviteReturn['check'] = async (codeOrToken) => {
    // A link's token leaves the address at once, so it is kept first: a check
    // that fails (a limit, the network) loses nothing, and a reload checks
    // the kept one again.
    const code = (codeOrToken ?? takeInviteFromAddress() ?? keptInvite() ?? '').trim()
    if (!code) {
      status.value = 'unknown'
      return status.value
    }
    keepInvite(code)
    kept.value = true
    try {
      return await run(async () => {
        if (!runCheck) throw new Error('[nuxt-backend] Checking an invite needs `checkInvite` re-exported from setupAccess() in backend/access.ts, or pass `{ api }` to useInvite().')
        const answer = await runCheck({ code })
        status.value = answer.status
        // Only a definite answer drops it.
        if (answer.status !== 'valid') forgetInvite()
        kept.value = answer.status === 'valid'
        return answer.status
      })
    }
    catch {
      return null
    }
  }

  return {
    check,
    status,
    isPending,
    error: computed(() => failure.value),
    isKept: computed(() => kept.value),
    forget: () => {
      forgetInvite()
      kept.value = false
    },
  }
}

export interface UseAccessAdminOptions {
  /** Override the injected `api.access` namespace. */
  api?: AccessApiRefs
}

export interface UseAccessAdminReturn {
  /** The Access tab's data, live: the phase, the codes and links, the invitations by address. `null` for a caller who is no administrator, `undefined` while it is read. */
  console: ComputedRef<AccessConsole | null | undefined>
  /** `true` while it is first read. */
  isLoading: ComputedRef<boolean>
  /** `true` once the read answered that this caller is no administrator. */
  isRefused: ComputedRef<boolean>
  /** `true` while a change is saved. */
  isPending: ComputedRef<boolean>
  /** Why the last change failed, else why the read failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Move the app to a phase. Takes a recent sign-in. Rejects on failure. */
  setPhase: (phase: AccessPhase) => Promise<void>
  /** Make a code or a link and answer it, once. Takes a recent sign-in. Rejects on failure. */
  createInvite: (input: { kind: InviteKind, label: string, maxUses: number, expiresAt?: number }) => Promise<{ id: string, code: string }>
  /** Close a code or a link, or delete an unused invitation by address. Takes a recent sign-in. Rejects on failure. */
  revoke: (id: string) => Promise<void>
  /** Invite addresses: with no email, unless `email` asks for one ("Email them", about a hundred an hour). Takes a recent sign-in. Rejects on failure. */
  admit: (emails: string[], label?: string, options?: { email?: boolean }) => Promise<AdmitResult>
}

/**
 * The admin console's Access tab, as data: the launch phase and its
 * change, the invite codes and access links, and the invitations by
 * address, through `backend/access.ts`. Every change is an
 * administrator's in person and takes a recent sign-in
 * (`useReauthentication().withReauthentication` asks for one).
 */
export function useAccessAdmin(options: UseAccessAdminOptions = {}): UseAccessAdminReturn {
  const api = useBackendNamespace<AccessApiRefs>('access', 'useAccessAdmin', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const read = api.getAccessConsole ? useLiveQuery(api.getAccessConsole, () => (signedOut.value ? 'skip' : {})) : absentQuery<AccessConsole | null>()
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  const call = <A extends DefaultFunctionArgs, R>(ref: FunctionReference<'mutation', 'public', A, R> | undefined, name: string) => {
    if (!ref && diagnostics.enabled) console.warn(`[nuxt-backend] useAccessAdmin(): the backend exports no \`${name}\`: re-export it from backend/access.ts with the rest of \`access.api\`.`)
    const mutate = ref ? useMutation(ref) : null
    return (args: A) => run(async () => {
      if (!mutate) throw new Error(`[nuxt-backend] The Access tab needs \`${name}\` re-exported from setupAccess() in backend/access.ts, or pass \`{ api }\` to useAccessAdmin().`)
      return await mutate(args as never) as R
    })
  }
  const setPhase = call(api.setAccessPhase, 'setAccessPhase')
  const createInvite = call(api.createInvite, 'createInvite')
  const revoke = call(api.revokeInvite, 'revokeInvite')
  const admit = call(api.admitEmails, 'admitEmails')

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
    setPhase: async (phase) => {
      await setPhase({ phase })
    },
    createInvite: input => createInvite(input),
    revoke: async (id) => {
      await revoke({ id })
    },
    admit: (emails, label, options = {}) => admit({ emails, ...(label?.trim() ? { label } : {}), ...(options.email ? { email: true } : {}) }),
  }
}
