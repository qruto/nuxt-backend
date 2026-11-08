import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject, type MaybeRefOrGetter, ref, type Ref, toValue, useId, watch } from 'vue'
import { useRequestURL, useRoute } from '#imports'
import { ConvexAuthStateKey, useAction, useMutation } from 'nuxt-convex-module/client'
import { backendError } from '../../../convex/errors.js'
import type { NoticeInput } from '../../../convex/integrations/reports.js'
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from '../../../convex/report-rules.js'
import { useActiveLocale } from '../utils/active-locale'
import { type BackendError, failureOf } from '../utils/backend-error'
import { useBackendNamespace } from '../utils/namespace'
import { useBackendPagePath } from './use-backend-page-path'
import { useHumanCheck } from './use-human-check'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn } from './use-labels'

export type { ReportReason } from '../../../convex/report-rules.js'

/**
 * How a report reaches the deployment: `notice`, a notice anyone may send
 * (DSA Art. 16), with a receipt and the decision by email; `quick`, a
 * signed-in person's one-click report into the Reports tab.
 */
export type ReportFormMode = 'notice' | 'quick'

/** Where a report form is: waiting for its fields, sending, done, refused by the deployment, or failed on the way. */
export type ReportFormState = 'ready' | 'pending' | 'sent' | 'error' | 'refused'

/** The fields a report is checked on. */
export type ReportField = 'reason' | 'details' | 'url' | 'name' | 'email' | 'goodFaith' | 'signature'

/** A thing of the app's to report: the table it is in and its row id. */
export interface ReportFormSubject {
  table: string
  id: string
}

/** The functions of `admin.api` the form calls. */
export interface ReportFormApiRefs {
  sendNotice?: FunctionReference<'action', 'public', NoticeInput, null>
  reportContent?: FunctionReference<'mutation', 'public', { subject: ReportFormSubject, reason: ReportReason, details?: string, website?: string }, null>
}

export interface UseReportFormOptions {
  /** `notice` (the default): a notice anyone may send, which the law asks a host to accept. `quick`: a signed-in person's one-click report. */
  mode?: ReportFormMode
  /**
   * The item's own permalink: the exact address a notice names. Give it
   * wherever one page shows several items, such as a feed with a form per
   * item. Default: the `?url=` the report page was opened with, else the
   * page the form is on, never the report page itself.
   */
  url?: MaybeRefOrGetter<string | undefined>
  /** The reasons to offer, in order. Default: every reason, in the order the report page lists them. */
  reasons?: MaybeRefOrGetter<readonly ReportReason[] | undefined>
  /** Override the injected `api.admin` namespace. */
  api?: ReportFormApiRefs
  /** Copy for this form, over app config and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'report'> | undefined>
  /** Called once the deployment filed the report. */
  onSent?: () => void
  /** Called with a refusal or a failure. */
  onError?: (error: BackendError) => void
}

export interface UseReportFormReturn {
  /** How the report is sent: a notice, or a signed-in person's one-click report. */
  mode: ReportFormMode
  /** Where the form is. */
  state: ComputedRef<ReportFormState>
  /** `true` while the report is on its way. */
  isPending: ComputedRef<boolean>
  /** Whether a person is signed in. A quick report needs one; signed out, `noticePath` is where to go. */
  signedIn: ComputedRef<boolean>
  /** `true` while the session is still being read: render a quick report once it is `false`, and a press before then waits for it. */
  isLoading: ComputedRef<boolean>
  /** The reasons offered, in order. */
  reasons: ComputedRef<readonly ReportReason[]>
  /** The reason picked; `null` until one is. */
  reason: Ref<ReportReason | null>
  /** Why the content is illegal or breaks the terms: required in a notice, optional in a quick report. Up to 4,000 characters. */
  details: Ref<string>
  /** The item's exact address: `options.url`, else filled in from the page, and followed as the route or the item changes. A notice requires it. */
  url: Ref<string>
  /** The reporter's name and address, for the receipt and the decision. A notice requires both, except about child sexual abuse material. */
  name: Ref<string>
  email: Ref<string>
  /** The reporter's statement that the notice is accurate and made in good faith. A notice requires it. */
  goodFaith: Ref<boolean>
  /** The typed full name that signs a request to remove an intimate image shared without consent. */
  signature: Ref<string>
  /** The honeypot: a field people never see. Leave it empty. */
  website: Ref<string>
  /** Whether the name and the address are required: in a notice, for every reason but child sexual abuse material. */
  contactRequired: ComputedRef<boolean>
  /** Whether the signature is required: a notice about an intimate image. */
  signatureRequired: ComputedRef<boolean>
  /** Why the last send was refused or failed; `null` otherwise. Cleared when the next one starts. */
  error: Readonly<Ref<BackendError | null>>
  /** The field the last refusal names, when it names one. */
  errorField: ComputedRef<ReportField | null>
  /** How long to wait before another report, in seconds, after a `rate_limited` refusal. */
  retryAfter: ComputedRef<number | null>
  /** The public report page, with the thing and its address in its query (`?table=&id=&url=`), which the page fills its form from: where a quick report sends someone signed out. `null` when the app turned the page off. */
  noticePath: ComputedRef<string | null>
  /** Check and send the report. Resolves `true` once the deployment filed it, `false` otherwise; never rejects. */
  send: () => Promise<boolean>
  /** Clear what the person wrote and the confirmation, to report again. The address stays. */
  reset: () => void
  /** What the live region says: the report is on its way, or was received (a notice with an address adds that the decision follows by email; one that filled the honeypot never does). */
  announcement: ComputedRef<string>
  /** The form's words, for markup of your own: `labels.t(\`reasons.${reason}\`)` names a reason. */
  labels: UseLabelsReturn<'report'>
  /**
   * Attribute bindings, with the accessibility attributes and the handlers,
   * for markup of your own. Each is a computed ref: spread its `.value`
   * (`v-bind="report.bind.root.value"`). `reason` is the exception, a
   * function of one reason that returns its radio button's attributes as a
   * plain object (`v-bind="report.bind.reason('spam')"`).
   */
  bind: {
    /** The `<form>`: `data-report="form"`, `data-mode`, `data-state`, busy while sending, and the submit handler. */
    root: ComputedRef<Record<string, unknown>>
    /** The `<fieldset>` around the reasons, described by the refusal when it names the reason. */
    reasons: ComputedRef<Record<string, unknown>>
    /** One reason's radio button: its value, whether it is picked, and the change handler. */
    reason: (reason: ReportReason) => Record<string, unknown>
    /** The details `<textarea>`: required in a notice, its length limit, and the refusal when it names the details. */
    details: ComputedRef<Record<string, unknown>>
    /** The address `<input type="url">`, filled in from the page. */
    urlInput: ComputedRef<Record<string, unknown>>
    /** The name `<input>`, required while `contactRequired`. */
    nameInput: ComputedRef<Record<string, unknown>>
    /** The address `<input type="email">`, required while `contactRequired`. */
    emailInput: ComputedRef<Record<string, unknown>>
    /** The good-faith checkbox. */
    goodFaithInput: ComputedRef<Record<string, unknown>>
    /** The signature `<input>`, required while `signatureRequired`: render it only then. */
    signatureInput: ComputedRef<Record<string, unknown>>
    /** The honeypot's wrapper: `hidden` and `aria-hidden`, so people and assistive technology never meet the field. */
    honeypot: ComputedRef<Record<string, unknown>>
    /** The honeypot field, inside `honeypot`: a name no browser fills on its own, no autocomplete, out of the tab order. */
    honeypotInput: ComputedRef<Record<string, unknown>>
    /** The submit button, `aria-disabled` while the report is on its way. */
    submit: ComputedRef<Record<string, unknown>>
    /** The live region, always in the page: put `announcement` in it. */
    status: ComputedRef<Record<string, unknown>>
    /** The refusal: an alert, which the field it names is described by. */
    errorText: ComputedRef<Record<string, unknown>>
  }
}

/** A failure that is the deployment's decision about the report, rather than a failure on the way. */
const isRefusal = (error: BackendError): boolean => ['invalid_input', 'forbidden', 'rate_limited', 'unauthenticated'].includes(error.code)

const FIELDS: readonly ReportField[] = ['reason', 'details', 'url', 'name', 'email', 'goodFaith', 'signature']

/** A short query value of an address, or `undefined`. */
function queryText(value: unknown): string | undefined {
  const text = Array.isArray(value) ? value[0] : value
  return typeof text === 'string' && text.trim() && text.length <= 2048 ? text.trim() : undefined
}

/** The address of the page the form is on, without its fragment (an appeal token travels there). */
function pageAddress(): string {
  try {
    const url = useRequestURL()
    url.hash = ''
    return url.href
  }
  catch {
    return ''
  }
}

/**
 * A report about content of the app's, without its markup. By default a
 * notice (DSA Art. 16), which anyone may send and a host must accept: the
 * content's exact address (filled in from the page), the reason, why it is
 * illegal or breaks the terms, the reporter's name and address (both may
 * be left out for child sexual abuse material), a signature for an
 * intimate image, and the statement that it is made in good faith. It is
 * sent through `sendNotice` with the bot check; the reporter gets a receipt
 * by email, and the decision once a person on your team made it.
 * `mode: 'quick'` is a signed-in person's one-click report instead, through
 * `reportContent`: a reason and optional details, into the Reports tab,
 * with no receipt. Both keep a honeypot, and the `report` limit of 10 an
 * hour per person or address. Needs `sendNotice` (or `reportContent`)
 * re-exported from `setupAdmin({ reports })` in `backend/admin.ts`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const props = defineProps<{ stripId: string }>()
 * const report = useReportForm(() => ({ table: 'strips', id: props.stripId }))
 * const { t } = report.labels
 * </script>
 * <template>
 *   <form v-bind="report.bind.root.value">
 *     <fieldset v-bind="report.bind.reasons.value">
 *       <legend>{{ t('reason') }}</legend>
 *       <label v-for="reason in report.reasons.value" :key="reason">
 *         <input v-bind="report.bind.reason(reason)"> {{ t(`reasons.${reason}`) }}
 *       </label>
 *     </fieldset>
 *     <label>{{ t('details') }} <textarea v-bind="report.bind.details.value" /></label>
 *     <label><input v-bind="report.bind.goodFaithInput.value"> {{ t('goodFaith') }}</label>
 *     <button v-bind="report.bind.submit.value">{{ t('send') }}</button>
 *     <p v-bind="report.bind.status.value">{{ report.announcement.value }}</p>
 *   </form>
 * </template>
 * ```
 */
export function useReportForm(subject?: MaybeRefOrGetter<ReportFormSubject | null | undefined>, options: UseReportFormOptions = {}): UseReportFormReturn {
  const mode: ReportFormMode = options.mode ?? 'notice'
  const labels = useLabels('report', () => toValue(options.labels))
  const api = useBackendNamespace<ReportFormApiRefs>('admin', 'useReportForm', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const notify = mode === 'notice' && api.sendNotice ? useAction(api.sendNotice) : null
  const flag = mode === 'quick' && api.reportContent ? useMutation(api.reportContent) : null
  const human = useHumanCheck()
  const activeLocale = useActiveLocale()
  const reportPage = useBackendPagePath('report')
  const route = useRoute()
  const id = useId() ?? `report-${Math.random().toString(36).slice(2)}`
  const idOf = (part: string) => `${id}-${part}`

  const reason = ref<ReportReason | null>(null)
  const details = ref('')
  /**
   * The item's address when the person has not typed one: the app's own
   * (`options.url`, the item's permalink), else the `?url=` the report page
   * was opened with, else the page the form is on, but never the report
   * page itself, which is no item's address.
   */
  function defaultAddress(): string {
    const given = toValue(options.url)?.trim()
    if (given) return given
    const asked = queryText(route.query.url)
    if (asked) return asked
    return reportPage.value && route.path === reportPage.value ? '' : pageAddress()
  }

  const url = ref(defaultAddress())
  const name = ref('')
  const email = ref('')
  const goodFaith = ref(false)
  const signature = ref('')
  const website = ref('')
  const phase = ref<ReportFormState>('ready')
  const error = ref<BackendError | null>(null)
  const anonymous = ref(false)

  const signedIn = computed(() => auth?.isAuthenticated.value === true)
  /** The session is still being read: a quick report waits for it. */
  const sessionLoading = computed(() => auth?.isLoading.value === true)
  const reasons = computed<readonly ReportReason[]>(() => {
    const chosen = toValue(options.reasons)
    return chosen?.length ? REPORT_REASONS.filter(each => chosen.includes(each)).sort((a, b) => chosen.indexOf(a) - chosen.indexOf(b)) : REPORT_REASONS
  })
  const contactRequired = computed(() => mode === 'notice' && reason.value !== 'child_abuse')
  const signatureRequired = computed(() => mode === 'notice' && reason.value === 'intimate')
  const errorField = computed<ReportField | null>(() => {
    const field = error.value?.code === 'invalid_input' ? error.value.data.field : null
    return FIELDS.includes(field as ReportField) ? field as ReportField : null
  })
  const retryAfter = computed(() => {
    const failure = error.value
    return failure?.code === 'rate_limited' && typeof failure.data.retryAfter === 'number' ? Math.ceil(failure.data.retryAfter / 1000) : null
  })
  const noticePath = computed(() => {
    const page = reportPage.value
    const thing = toValue(subject)
    if (!page) return null
    const address = url.value.trim()
    const query = new URLSearchParams({ ...(thing ? { table: thing.table, id: thing.id } : {}), ...(address ? { url: address } : {}) }).toString()
    return query ? `${page}?${query}` : page
  })

  // Another item's address, or another page: the address follows it.
  watch([() => toValue(options.url), () => route.fullPath], () => {
    url.value = defaultAddress()
  })
  // Another thing is another report: the form starts over, its address included.
  watch(() => {
    const thing = toValue(subject)
    return thing ? `${thing.table}:${thing.id}` : ''
  }, () => {
    reset()
    url.value = defaultAddress()
  })

  function fail(failure: BackendError): false {
    error.value = failure
    phase.value = isRefusal(failure) ? 'refused' : 'error'
    options.onError?.(failure)
    return false
  }

  const refuse = (field: ReportField, detail: string, why?: 'required' | 'too_long') => fail(failureOf(backendError('invalid_input', { field, ...(why ? { reason: why } : {}) }, detail)))

  /** The first field the deployment would refuse, checked here so nothing is sent for it. */
  function problem(): false | null {
    if (!reason.value || !reasons.value.includes(reason.value)) return refuse('reason', '[nuxt-backend] useReportForm: pick a reason.')
    if (details.value.trim().length > REPORT_DETAILS_MAX) return refuse('details', `[nuxt-backend] useReportForm: the details are longer than ${REPORT_DETAILS_MAX} characters.`, 'too_long')
    if (mode === 'quick') return null
    if (!url.value.trim()) return refuse('url', '[nuxt-backend] useReportForm: a notice names the content\'s address.', 'required')
    if (!details.value.trim()) return refuse('details', '[nuxt-backend] useReportForm: a notice says why the content is illegal or breaks the terms.', 'required')
    if (contactRequired.value && !name.value.trim()) return refuse('name', '[nuxt-backend] useReportForm: a notice names who sends it.', 'required')
    if (contactRequired.value && !email.value.trim()) return refuse('email', '[nuxt-backend] useReportForm: a notice gives an address for the receipt and the decision.', 'required')
    if (signatureRequired.value && !signature.value.trim()) return refuse('signature', '[nuxt-backend] useReportForm: a request to remove an intimate image is signed.', 'required')
    if (!goodFaith.value) return refuse('goodFaith', '[nuxt-backend] useReportForm: a notice states it is made in good faith.')
    return null
  }

  async function deliver(thing: ReportFormSubject | null | undefined, chosen: ReportReason): Promise<void> {
    const trimmed = details.value.trim()
    if (mode === 'quick') {
      await flag!({ subject: { table: thing!.table, id: thing!.id }, reason: chosen, ...(trimmed ? { details: trimmed } : {}), ...(website.value ? { website: website.value } : {}) })
      return
    }
    const address = email.value.trim()
    const locale = activeLocale()
    await notify!({
      url: url.value.trim(),
      reason: chosen,
      details: trimmed,
      ...(name.value.trim() ? { name: name.value.trim() } : {}),
      ...(address ? { email: address } : {}),
      goodFaith: goodFaith.value,
      ...(signatureRequired.value && signature.value.trim() ? { signature: signature.value.trim() } : {}),
      ...(thing ? { subject: { table: thing.table, id: thing.id } } : {}),
      ...(locale ? { locale } : {}),
      ...(website.value ? { website: website.value } : {}),
      human: await human.token('report', address ? address.toLowerCase() : undefined),
    })
    // A form that filled the honeypot is told it was received, never that a decision will follow.
    anonymous.value = !address || Boolean(website.value)
  }

  /** Resolves once the session has been read. */
  function sessionRead(): Promise<void> {
    if (!sessionLoading.value) return Promise.resolve()
    return new Promise((resolve) => {
      const stop = watch(sessionLoading, (loading) => {
        if (loading) return
        stop()
        resolve()
      })
    })
  }

  async function send(): Promise<boolean> {
    if (phase.value === 'pending') return false
    error.value = null
    const thing = toValue(subject)
    if (mode === 'quick' && sessionLoading.value) {
      // Pressed before the session was read: wait for it, rather than refuse a signed-in person.
      phase.value = 'pending'
      await sessionRead()
    }
    if (mode === 'quick' && !signedIn.value) return fail(failureOf(backendError('unauthenticated', {}, '[nuxt-backend] Sign in to report content, or use the report form.')))
    if (mode === 'quick' && !thing) return fail(failureOf(backendError('invalid_input', { field: 'subject' }, '[nuxt-backend] A quick report names the thing: pass it as `{ table, id }`.')))
    if (problem() === false) return false
    const run = mode === 'quick' ? flag : notify
    if (!run) return fail(failureOf(new Error(`[nuxt-backend] useReportForm needs \`${mode === 'quick' ? 'reportContent' : 'sendNotice'}\` re-exported from setupAdmin({ reports }) in backend/admin.ts.`)))
    phase.value = 'pending'
    try {
      await deliver(thing, reason.value!)
    }
    catch (cause) {
      return fail(failureOf(cause))
    }
    phase.value = 'sent'
    options.onSent?.()
    return true
  }

  function reset() {
    reason.value = null
    details.value = ''
    signature.value = ''
    goodFaith.value = false
    error.value = null
    phase.value = 'ready'
  }

  const announcement = computed(() => {
    if (phase.value === 'pending') return labels.t('sending')
    if (phase.value !== 'sent') return ''
    if (mode === 'quick') return labels.t('content.sent')
    return anonymous.value ? labels.t('sentAnonymous') : labels.t('sent')
  })
  const described = (field: ReportField, ...parts: Array<string | false>) => [...parts, errorField.value === field && idOf('error')].filter(Boolean).join(' ') || undefined
  const invalid = (field: ReportField) => (errorField.value === field ? 'true' : undefined)
  const typed = (target: Ref<string>) => (event: Event) => {
    target.value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  }

  const bind: UseReportFormReturn['bind'] = {
    root: computed(() => ({
      'data-report': 'form',
      'data-mode': mode,
      'data-state': phase.value,
      'aria-busy': phase.value === 'pending' || undefined,
      'novalidate': true,
      'onSubmit': (event: Event) => {
        event.preventDefault()
        void send()
      },
    })),
    reasons: computed(() => ({
      'id': idOf('reasons'),
      'data-report': 'reasons',
      'aria-invalid': invalid('reason'),
      'aria-describedby': described('reason'),
    })),
    reason: (value: ReportReason) => ({
      'type': 'radio',
      'name': idOf('reason'),
      'value': value,
      'required': true,
      'checked': reason.value === value,
      'data-report': 'reason',
      'data-state': reason.value === value ? 'checked' : 'unchecked',
      'onChange': () => {
        reason.value = value
      },
    }),
    details: computed(() => ({ 'id': idOf('details'), 'name': 'details', 'required': mode === 'notice', 'maxlength': REPORT_DETAILS_MAX, 'data-report': 'input-details', 'aria-invalid': invalid('details'), 'aria-describedby': described('details'), 'value': details.value, 'onInput': typed(details) })),
    urlInput: computed(() => ({ 'id': idOf('url'), 'name': 'url', 'type': 'url', 'inputmode': 'url', 'required': true, 'data-report': 'input-url', 'aria-invalid': invalid('url'), 'aria-describedby': described('url'), 'value': url.value, 'onInput': typed(url) })),
    nameInput: computed(() => ({ 'id': idOf('name'), 'name': 'name', 'type': 'text', 'autocomplete': 'name', 'required': contactRequired.value, 'data-report': 'input-name', 'aria-invalid': invalid('name'), 'aria-describedby': described('name'), 'value': name.value, 'onInput': typed(name) })),
    emailInput: computed(() => ({ 'id': idOf('email'), 'name': 'email', 'type': 'email', 'autocomplete': 'email', 'required': contactRequired.value, 'data-report': 'input-email', 'aria-invalid': invalid('email'), 'aria-describedby': described('email'), 'value': email.value, 'onInput': typed(email) })),
    goodFaithInput: computed(() => ({
      'id': idOf('good-faith'),
      'name': 'goodFaith',
      'type': 'checkbox',
      'required': mode === 'notice',
      'checked': goodFaith.value,
      'data-report': 'input-good-faith',
      'aria-invalid': invalid('goodFaith'),
      'aria-describedby': described('goodFaith'),
      'onChange': (event: Event) => {
        goodFaith.value = (event.target as HTMLInputElement).checked
      },
    })),
    signatureInput: computed(() => ({ 'id': idOf('signature'), 'name': 'signature', 'type': 'text', 'autocomplete': 'name', 'required': signatureRequired.value, 'data-report': 'input-signature', 'aria-invalid': invalid('signature'), 'aria-describedby': described('signature'), 'value': signature.value, 'onInput': typed(signature) })),
    honeypot: computed(() => ({ 'hidden': true, 'aria-hidden': 'true', 'data-report': 'trap' })),
    honeypotInput: computed(() => ({
      // A name no browser or password manager fills on its own, so a person's notice never trips it.
      'name': 'nuxt-backend-trap',
      'type': 'text',
      'tabindex': -1,
      'autocomplete': 'off',
      'aria-hidden': 'true',
      'aria-label': labels.t('content.trap'),
      'data-report': 'input-trap',
      'value': website.value,
      'onInput': typed(website),
    })),
    submit: computed(() => ({ 'type': 'submit', 'data-report': 'send', 'aria-disabled': phase.value === 'pending' || undefined })),
    status: computed(() => ({ 'id': idOf('status'), 'role': 'status', 'aria-live': 'polite', 'data-report': 'status' })),
    errorText: computed(() => ({ 'id': idOf('error'), 'role': 'alert', 'data-report': 'error' })),
  }

  return {
    mode,
    state: computed(() => phase.value),
    isPending: computed(() => phase.value === 'pending'),
    signedIn,
    isLoading: sessionLoading,
    reasons,
    reason,
    details,
    url,
    name,
    email,
    goodFaith,
    signature,
    website,
    contactRequired,
    signatureRequired,
    error,
    errorField,
    retryAfter,
    noticePath,
    send,
    reset,
    announcement,
    labels,
    bind,
  }
}
