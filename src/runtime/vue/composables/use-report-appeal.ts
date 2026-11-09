import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, onMounted, ref, type Ref, toValue } from 'vue'
import { useMutation } from 'nuxt-convex-module/client'
import type { AppealView } from '../../../convex/integrations/reports.js'
import { APPEAL_FRAGMENT } from '../../../convex/report-rules.js'
import { type BackendError, failureOf } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { formatBillingDate } from './billing-format'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn } from './use-labels'

export type { AppealView } from '../../../convex/integrations/reports.js'

/**
 * Where an appeal is: no token to read (`none`), reading the decision
 * (`checking`), a link that names no decision (`unknown`), a decision past
 * its six months (`expired`), the form (`form`), or the appeal sent and
 * waiting (`open`), then decided (`upheld`, `reversed`).
 */
export type ReportAppealState = 'none' | 'checking' | 'unknown' | 'expired' | 'form' | 'open' | 'upheld' | 'reversed'

/** The functions of `admin.api` the appeal calls. */
export interface ReportAppealApiRefs {
  getAppeal?: FunctionReference<'query', 'public', { token: string }, AppealView | null>
  appealDecision?: FunctionReference<'mutation', 'public', { token: string, text: string }, null>
}

export interface UseReportAppealOptions {
  /** Override the injected `api.admin` namespace. */
  api?: ReportAppealApiRefs
  /** Copy for this appeal, over app config and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'report'> | undefined>
  /** Called once the deployment took the appeal. */
  onSent?: () => void
  /** Called with a refusal or a failure. */
  onError?: (error: BackendError) => void
}

export interface UseReportAppealReturn {
  /** The decision's token the appeal reads: the one passed in, else the page's `#appeal=<token>` once mounted; `null` for none. */
  token: ComputedRef<string | null>
  /** Where the appeal is. */
  state: ComputedRef<ReportAppealState>
  /** The decision and its reason, until when it may be appealed, and the appeal sent, if any: `undefined` while it is read, `null` for no token or a link that names no decision. */
  decision: ComputedRef<AppealView | null | undefined>
  /** Why the decision should change: up to 4,000 characters. */
  text: Ref<string>
  /** `true` while the appeal is on its way. */
  isPending: ComputedRef<boolean>
  /** Why the last send failed, else `null`. */
  error: Readonly<Ref<BackendError | null>>
  /** Send the appeal: once per decision. Resolves `true` once the deployment took it, `false` otherwise (nothing written, no form, a refusal); never rejects. */
  send: () => Promise<boolean>
  /** A date of the decision (`at`, `until`) in the active language, as the packaged page writes it. */
  formatDate: (at: number) => string
  /** The page's words, for markup of your own: `labels.t('appeal.title')`. */
  labels: UseLabelsReturn<'report'>
}

/** The token a `#appeal=<token>` fragment carries, or `null`. */
function fragmentToken(hash: string): string | null {
  const fragment = decodeURIComponent(hash.replace(/^#/, '')).trim()
  return fragment.startsWith(APPEAL_FRAGMENT) ? fragment.slice(APPEAL_FRAGMENT.length) || null : null
}

/**
 * The appeal of a content decision, without its markup: the decision a
 * `#appeal=<token>` link names, the appeal's state, and sending it once.
 *
 * The author of something hidden (or of a report dismissed) opens the link
 * in their statement of reasons, `/report#appeal=<token>`, reads the
 * decision and its reason, then says once, until six months after it, why
 * it should change (DSA Art. 20). The appeal waits in the admin console's
 * Reports tab, and its outcome reaches the author by email.
 *
 * With no token passed, it reads the page's fragment once mounted (no
 * request carries a fragment, so the token never reaches a server log).
 * Needs `getAppeal` and `appealDecision` re-exported from
 * `setupAdmin({ reports })` in `backend/admin.ts`. `useReportForm` is the
 * notice half of the same page.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const appeal = useReportAppeal()
 * const { t } = appeal.labels
 * </script>
 * <template>
 *   <form v-if="appeal.state.value === 'form'" @submit.prevent="appeal.send()">
 *     <p>{{ appeal.decision.value?.reason }}</p>
 *     <label>{{ t('appeal.text') }} <textarea v-model="appeal.text.value" maxlength="4000" required /></label>
 *     <button :aria-disabled="appeal.isPending.value || undefined">{{ t('appeal.send') }}</button>
 *   </form>
 *   <p v-else-if="appeal.state.value !== 'none'" role="status">{{ t(`appeal.${appeal.state.value}`) }}</p>
 * </template>
 * ```
 */
export function useReportAppeal(token?: MaybeRefOrGetter<string | null | undefined>, options: UseReportAppealOptions = {}): UseReportAppealReturn {
  const api = useBackendNamespace<ReportAppealApiRefs>('admin', 'useReportAppeal', options.api)
  const labels = useLabels('report', () => toValue(options.labels))
  // No token given: the page's fragment, which only the browser has.
  const fromPage = ref<string | null>(null)
  if (token === undefined) {
    onMounted(() => {
      fromPage.value = fragmentToken(window.location.hash)
    })
  }
  const current = computed(() => (token === undefined ? fromPage.value : toValue(token) || null))
  const read = api.getAppeal ? useLiveQuery(api.getAppeal, () => (current.value ? { token: current.value } : 'skip')) : absentQuery<AppealView | null>()
  const appeal = api.appealDecision ? useMutation(api.appealDecision) : null
  const text = ref('')
  const pending = ref(false)
  const error = ref<BackendError | null>(null)

  const decision = computed(() => (current.value ? read.data.value : null))
  const state = computed<ReportAppealState>(() => {
    if (!current.value) return 'none'
    const view = decision.value
    if (view === null) return 'unknown'
    if (view === undefined) return 'checking'
    if (view.appeal) return view.appeal.status
    return view.until < Date.now() ? 'expired' : 'form'
  })

  async function send(): Promise<boolean> {
    if (pending.value || state.value !== 'form' || !text.value.trim()) return false
    error.value = null
    pending.value = true
    try {
      if (!appeal) throw new Error('[nuxt-backend] useReportAppeal() needs `appealDecision` re-exported from setupAdmin({ reports }) in backend/admin.ts, or pass { api }.')
      await appeal({ token: current.value!, text: text.value })
      options.onSent?.()
      return true
    }
    catch (cause) {
      error.value = failureOf(cause)
      options.onError?.(error.value)
      return false
    }
    finally {
      pending.value = false
    }
  }

  return {
    token: current,
    state,
    decision,
    text,
    isPending: computed(() => pending.value),
    error,
    send,
    formatDate: at => formatBillingDate(at, { dateStyle: 'long' }, labels.locale.value),
    labels,
  }
}
