import type { FunctionReference } from 'convex/server'
import { computed, reactive, ref, useId } from 'vue'
import { useRoute } from '#imports'
import { useAction, useMutation } from 'nuxt-convex-module/client'
import type { AppealView, NoticeInput } from '../../../../convex/integrations/reports'
import { REPORT_REASONS, type ReportReason } from '../../../../convex/report-rules'
import { formatBillingDate } from '../../composables/billing-format'
import { useHumanCheck } from '../../composables/use-human-check'
import { useLabels } from '../../composables/use-labels'
import { useActiveLocale } from '../../utils/active-locale'
import { getBackendError } from '../../utils/backend-error'
import { absentQuery, useLiveQuery } from '../../utils/live-query'
import { useBackendNamespace } from '../../utils/namespace'

// The `report` page's two forms, headless: the notice anyone may send
// (`ReportNotice.vue`) and the author's appeal (`ReportAppeal.vue`), through
// the functions `backend/admin.ts` re-exports from `setupAdmin({ reports })`.

/** The report functions the page calls. */
interface ReportPageRefs {
  sendNotice?: FunctionReference<'action', 'public', NoticeInput, null>
  getAppeal?: FunctionReference<'query', 'public', { token: string }, AppealView | null>
  appealDecision?: FunctionReference<'mutation', 'public', { token: string, text: string }, null>
}

const missing = (name: string) => new Error(`[nuxt-backend] The report page needs \`${name}\` re-exported from setupAdmin({ reports }) in backend/admin.ts.`)

/** A short query value of the page's address, or `undefined`. */
function queryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value && value.length <= 2048 ? value : undefined
}

/**
 * The notice form: the link (from `?url=`), the reason, why, the
 * notifier's name and address (both optional for child sexual abuse
 * material), the signature of an intimate-image request, and the
 * good-faith statement; the thing it is about when the page was opened
 * from it (`?table=&id=`). Sent with a bot-check token.
 *
 * @internal
 */
export function useReportNotice() {
  const api = useBackendNamespace<ReportPageRefs>('admin', 'ReportNotice')
  const send = api.sendNotice ? useAction(api.sendNotice) : null
  const human = useHumanCheck()
  const route = useRoute()
  const locale = useActiveLocale()
  const { t, errorMessage } = useLabels('report')
  const id = useId()
  const table = queryValue(route.query.table)
  const subjectId = queryValue(route.query.id)
  const form = reactive({ url: queryValue(route.query.url) ?? '', reason: 'illegal' as ReportReason, details: '', name: '', email: '', signature: '', goodFaith: false })
  const state = ref<'idle' | 'sending' | 'sent'>('idle')
  const error = ref<unknown>(null)
  const anonymous = ref(false)

  const intimate = computed(() => form.reason === 'intimate')
  /** Art. 16(2)(c): a name and an address, except for child sexual abuse material. */
  const contactRequired = computed(() => form.reason !== 'child_abuse')
  const invalidField = computed(() => {
    const data = getBackendError(error.value)?.data as { field?: string } | undefined
    return data?.field
  })

  async function submit(): Promise<void> {
    if (state.value === 'sending') return
    error.value = null
    state.value = 'sending'
    try {
      if (!send) throw missing('sendNotice')
      const email = form.email.trim()
      const token = await human.token('report', email || undefined)
      await send({
        url: form.url,
        reason: form.reason,
        details: form.details,
        ...(form.name.trim() ? { name: form.name } : {}),
        ...(email ? { email } : {}),
        goodFaith: form.goodFaith,
        ...(intimate.value && form.signature.trim() ? { signature: form.signature } : {}),
        ...(table && subjectId ? { subject: { table, id: subjectId } } : {}),
        ...(locale() ? { locale: locale()! } : {}),
        human: token,
      })
      anonymous.value = !email
      state.value = 'sent'
    }
    catch (cause) {
      error.value = cause
      state.value = 'idle'
    }
  }

  return {
    id,
    t,
    form,
    reasons: REPORT_REASONS,
    state,
    intimate,
    contactRequired,
    anonymous,
    invalidField,
    errorText: computed(() => (error.value ? errorMessage(error.value) : null)),
    submit,
  }
}

/**
 * The author's appeal against a decision, by the token the statement of
 * reasons links with: the decision and its reason, then a box for why it
 * should change, once, until six months after it.
 *
 * @internal
 */
export function useReportAppeal(token: () => string | null) {
  const api = useBackendNamespace<ReportPageRefs>('admin', 'ReportAppeal')
  const read = api.getAppeal ? useLiveQuery(api.getAppeal, () => (token() ? { token: token()! } : 'skip')) : absentQuery<AppealView | null>()
  const appeal = api.appealDecision ? useMutation(api.appealDecision) : null
  const { t, errorMessage, locale } = useLabels('report')
  const id = useId()
  const text = ref('')
  const sending = ref(false)
  const error = ref<unknown>(null)

  const view = computed(() => read.data.value)
  /** What the person reads: still checking, a link that names no decision, a decision past its window, the form, or the appeal's state. */
  const state = computed(() => {
    if (!token() || view.value === null) return 'unknown' as const
    if (view.value === undefined) return 'checking' as const
    if (view.value.appeal) return view.value.appeal.status
    return view.value.until < Date.now() ? 'expired' as const : 'form' as const
  })

  async function submit(): Promise<void> {
    if (sending.value || !text.value.trim()) return
    error.value = null
    sending.value = true
    try {
      if (!appeal) throw missing('appealDecision')
      await appeal({ token: token()!, text: text.value })
    }
    catch (cause) {
      error.value = cause
    }
    finally {
      sending.value = false
    }
  }

  return {
    id,
    t,
    view,
    state,
    text,
    sending,
    errorText: computed(() => (error.value ? errorMessage(error.value) : null)),
    date: (at: number) => formatBillingDate(at, { dateStyle: 'long' }, locale.value),
    submit,
  }
}
