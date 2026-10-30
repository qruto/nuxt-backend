import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, ref, type Ref, toValue } from 'vue'
import { useMutation } from 'nuxt-convex-module/client'
import type { SourceView } from '../../../convex/integrations/audit'
import { type CampaignTouch, SOURCE_ANSWERS, SOURCE_DETAIL_MAX } from '../../../convex/funnel-rules'
import { useActionState } from '../utils/action-state'
import { useAuthSession } from '../utils/auth-session'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useApiNamespace } from '../utils/namespace'
import { useCampaign } from './use-campaign'

/** The functions of `audit.api` the question reads and writes. */
export interface HowDidYouHearApi {
  getSource?: FunctionReference<'query', 'public', Record<string, never>, SourceView | null>
  recordSource?: FunctionReference<'mutation', 'public', { answer?: string | null, detail?: string, touch?: CampaignTouch }, SourceView>
}

export interface UseHowDidYouHearOptions {
  /** The answers offered, in order. Default: friend, search, AI assistant, social, podcast, other. */
  options?: MaybeRefOrGetter<readonly string[] | undefined>
  /** Override the injected `api.audit` namespace. */
  api?: HowDidYouHearApi
}

export interface UseHowDidYouHearReturn {
  /** The answers offered, in order. */
  options: ComputedRef<readonly string[]>
  /** The answer picked, or `null` before one is. */
  chosen: Ref<string | null>
  /** An "Other" answer's own words. */
  detail: Ref<string>
  /** The longest the words may be. */
  detailMax: number
  /** The person answered (or skipped) it before: it is not asked again. */
  isAnswered: ComputedRef<boolean>
  /** The answer, or the skip, was kept just now. */
  isDone: Ref<boolean>
  /** Nobody is signed in: there is no one to ask. */
  isSignedOut: ComputedRef<boolean>
  /** `true` until the first read lands. */
  isLoading: ComputedRef<boolean>
  /** `true` while the answer is saved. */
  isPending: ComputedRef<boolean>
  /** Why saving failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Keep the picked answer, with the campaign the address carries. Resolves the answer kept (`null` for none picked). */
  submit: () => Promise<string | null>
  /** Skip the question for good, keeping the campaign the address carries. */
  skip: () => Promise<void>
}

/**
 * "How did you hear about us?" without its markup: the answers offered, the
 * one picked, an "Other" answer's own words, and keeping the answer (or the
 * skip) once, with the first-touch campaign the address carries. Needs
 * `getSource` and `recordSource` re-exported from `audit.api`.
 *
 * @internal
 */
export function useHowDidYouHear(options: UseHowDidYouHearOptions = {}): UseHowDidYouHearReturn {
  const api = options.api ?? useApiNamespace<HowDidYouHearApi>('audit') ?? {}
  const auth = useAuthSession()
  const campaign = useCampaign()
  const signedOut = computed(() => !auth.isAuthenticated.value)
  const read = api.getSource ? useLiveQuery(api.getSource, () => (signedOut.value ? 'skip' : {})) : absentQuery<SourceView | null>()
  const record = api.recordSource ? useMutation(api.recordSource) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  const chosen = ref<string | null>(null)
  const detail = ref('')
  const isDone = ref(false)

  /** Keep an answer (or a skip, `null`) with the address's campaign. */
  async function keep(answer: string | null): Promise<void> {
    if (!record) {
      isDone.value = true
      return
    }
    const touch = campaign.attribution.value
    await run(() => record({
      answer,
      ...(answer === 'other' && detail.value.trim() ? { detail: detail.value.trim().slice(0, SOURCE_DETAIL_MAX) } : {}),
      ...(touch ? { touch } : {}),
    }))
    isDone.value = true
  }

  return {
    options: computed(() => toValue(options.options) ?? SOURCE_ANSWERS),
    chosen,
    detail,
    detailMax: SOURCE_DETAIL_MAX,
    isAnswered: computed(() => read.data.value?.asked === true),
    isDone,
    isSignedOut: signedOut,
    isLoading: computed(() => auth.isLoading.value || (!signedOut.value && Boolean(api.getSource) && read.isLoading.value)),
    isPending,
    error: computed(() => failure.value),
    submit: async () => {
      const answer = chosen.value
      await keep(answer)
      return answer
    },
    skip: () => keep(null),
  }
}
