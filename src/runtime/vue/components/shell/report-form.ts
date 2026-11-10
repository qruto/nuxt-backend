import type { FunctionReference } from 'convex/server'
import { computed, reactive, ref, useId } from 'vue'
import { useRoute } from '#imports'
import { useAction } from 'nuxt-convex-module/client'
import type { NoticeInput } from '../../../../convex/integrations/reports'
import { REPORT_REASONS, type ReportReason } from '../../../../convex/report-rules'
import { useHumanCheck } from '../../composables/use-human-check'
import { useLabels } from '../../composables/use-labels'
import { useActiveLocale } from '../../utils/active-locale'
import { getBackendError } from '../../utils/backend-error'
import { useBackendNamespace } from '../../utils/namespace'

// The `report` page's notice form, headless (`ReportNotice.vue`), through the
// `sendNotice` `backend/admin.ts` re-exports from `setupAdmin({ reports })`.
// The author's appeal (`ReportAppeal.vue`) is the public `useReportAppeal`.

/** The report function the notice form calls. */
interface ReportPageRefs {
  sendNotice?: FunctionReference<'action', 'public', NoticeInput, null>
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
