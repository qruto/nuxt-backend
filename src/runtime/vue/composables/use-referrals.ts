import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, onMounted, ref, type Ref, shallowRef, watch } from 'vue'
import { useMutation } from 'nuxt-convex-module/client'
import type { ClaimRefusal, ReferralCodeView, ReferralConsole, ReferralPreview, ReferralProgram, ReferralsView } from '../../../convex/integrations/referrals'
import { useActionState } from '../utils/action-state'
import { useAuthSession } from '../utils/auth-session'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { useBackendPagePath } from './use-backend-page-path'
import { useLabels } from './use-labels'

export type { ClaimRefusal, ReferralCodeView, ReferralConsole, ReferralPreview, ReferralProgram, ReferralsView } from '../../../convex/integrations/referrals'

/** The functions re-exported from your `backend/referrals.ts`. */
export interface ReferralsApiRefs {
  getReferralCode?: FunctionReference<'mutation', 'public', Record<string, never>, ReferralCodeView>
  getReferrals?: FunctionReference<'query', 'public', Record<string, never>, ReferralsView | null>
  claimReferral?: FunctionReference<'mutation', 'public', { code: string, fromSignIn?: boolean }, { claimed: true } | { claimed: false, reason: ClaimRefusal }>
  previewReferral?: FunctionReference<'query', 'public', { code: string }, ReferralPreview | null>
  setReferralSharing?: FunctionReference<'mutation', 'public', { share: boolean }, null>
  getReferralConsole?: FunctionReference<'query', 'public', { referrerId?: string }, ReferralConsole | null>
  resolveReferral?: FunctionReference<'mutation', 'public', { id: string, resolution: 'release' | 'void' }, { resolved: boolean }>
}

export interface UseReferralsOptions {
  /** Override the injected `api.referrals` namespace. */
  api?: ReferralsApiRefs
}

export interface UseReferralsReturn {
  /** The person's code, made on the first read; `null` until then, and while signed out. */
  code: Ref<string | null>
  /** The link to share: `/r/<code>` on this site. `null` until the code is there. */
  link: ComputedRef<string | null>
  /** What the share text says: both sides' rewards and the incentive, in the reader's words. */
  shareText: ComputedRef<string>
  /** What each side gets, as the program names it; `null` until the code is read. */
  program: Ref<ReferralProgram | null>
  /** The referrals the code earned: counts of `claimed`, `held` and `rewarded`, and each one's state. `undefined` while loading. */
  referrals: ComputedRef<ReferralsView | undefined>
  /** Whether share pages carry the code (the person's choice). */
  sharePages: Ref<boolean>
  /** `true` until the code and the referrals are read. */
  isLoading: ComputedRef<boolean>
  /** `true` while the person's choice is saved. */
  isPending: ComputedRef<boolean>
  /** Why the last read or action failed, or `null`. */
  error: ComputedRef<BackendError | null>
  /** Whether this browser can open its share sheet (`navigator.share`). */
  canShare: Ref<boolean>
  /** Whether the link was copied just now. */
  copied: Ref<boolean>
  /** Copy the share text and the link. Resolves `false` where the clipboard is refused. */
  copy: () => Promise<boolean>
  /** Open the browser's share sheet with the text and the link. Resolves `false` where there is none, or the person closed it. */
  share: () => Promise<boolean>
  /** Choose whether share pages carry the person's code. Rejects on failure, which `error` also holds. */
  setSharePages: (share: boolean) => Promise<void>
}

/** The code of a link in the share text's place: `/r/<code>` where the page lives. */
function linkFor(origin: string, path: string, code: string): string {
  return `${origin}${path.replace(':code', encodeURIComponent(code))}`
}

/**
 * A person's referral code, link and rewards: the data behind
 * `<ReferralCard>`, for a page of your own. The code is made on the first
 * read (a signed-in person's), and the link is `/r/<code>` on this site. The
 * share text says what both sides get, as endorsement rules ask. The lists
 * never throw: a failed read shows in `error`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { link, shareText, referrals, isLoading } = useReferrals()
 * </script>
 * <template>
 *   <ReferralCard />
 *   <p v-if="!isLoading">{{ referrals?.rewarded ?? 0 }} friends rewarded so far</p>
 * </template>
 * ```
 */
export function useReferrals(options: UseReferralsOptions = {}): UseReferralsReturn {
  const api = useBackendNamespace<ReferralsApiRefs>('referrals', 'useReferrals', options.api)
  const { isAuthenticated } = useAuthSession()
  const signedOut = computed(() => !isAuthenticated.value)
  const { t } = useLabels('referral')
  const landing = useBackendPagePath('referral')

  const runCode = api.getReferralCode ? useMutation(api.getReferralCode) : null
  const runSharing = api.setReferralSharing ? useMutation(api.setReferralSharing) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  const code = ref<string | null>(null)
  const program = shallowRef<ReferralProgram | null>(null)
  const sharePages = ref(true)
  const loadingCode = ref(false)
  const codeError = shallowRef<BackendError | null>(null)

  // A mutation, so the first read is made in the browser, once the person is signed in.
  const read = async () => {
    if (!runCode || signedOut.value || code.value) return
    loadingCode.value = true
    try {
      const made = await run(() => runCode({}), { silent: true })
      code.value = made.code
      program.value = made.program
      sharePages.value = made.sharePages
      codeError.value = null
    }
    catch {
      codeError.value = failure.value
    }
    finally {
      loadingCode.value = false
    }
  }
  onMounted(() => void read())
  watch(signedOut, (out) => {
    if (out) {
      code.value = null
      program.value = null
    }
    else void read()
  })

  const counts = api.getReferrals
    ? useLiveQuery(api.getReferrals, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<ReferralsView | null>()
  const referrals = computed(() => counts.data.value ?? undefined)

  const link = computed(() => {
    if (!code.value) return null
    const origin = typeof window === 'undefined' ? '' : window.location.origin
    return linkFor(origin, landing.value ?? '/r/:code', code.value)
  })

  const shareText = computed(() => {
    const offers = program.value
    const referred = offers?.referred
    const referrer = offers?.referrer
    // What the friend gets, then what the sharer gets: the incentive is said where the link is.
    const friend = referred
      ? referred.kind === 'trial' ? t('friendTrial', { days: referred.days }) : t('friendDiscount', { name: referred.name })
      : null
    const mine = referrer
      ? referrer.kind === 'pack' ? t('sharerPack', { name: referrer.name }) : t('sharerMonths', { count: referrer.months })
      : null
    return [t('shareLead'), friend, mine ? t('shareSharer', { reward: mine }) : null].filter(Boolean).join(' ')
  })

  const canShare = ref(false)
  onMounted(() => {
    canShare.value = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  })
  const copied = ref(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  return {
    code,
    link,
    shareText,
    program,
    referrals,
    sharePages,
    isLoading: computed(() => !signedOut.value && (loadingCode.value || (Boolean(api.getReferrals) && counts.isLoading.value))),
    isPending,
    error: computed(() => failure.value ?? codeError.value ?? counts.error.value),
    canShare,
    copied,
    copy: async () => {
      if (!link.value) return false
      try {
        await navigator.clipboard.writeText(`${shareText.value} ${link.value}`)
        copied.value = true
        clearTimeout(copiedTimer)
        copiedTimer = setTimeout(() => (copied.value = false), 3000)
        return true
      }
      catch {
        copied.value = false
        return false
      }
    },
    share: async () => {
      if (!link.value || typeof navigator.share !== 'function') return false
      try {
        await navigator.share({ text: shareText.value, url: link.value })
        return true
      }
      catch {
        // The person closed the sheet: nothing failed.
        return false
      }
    },
    setSharePages: async (share) => {
      if (!runSharing) throw new Error('[nuxt-backend] Turning the code off for share pages needs `setReferralSharing` re-exported from setupReferrals() in backend/referrals.ts, or pass `{ api }` to useReferrals().')
      await run(() => runSharing({ share }))
      sharePages.value = share
    },
  }
}
