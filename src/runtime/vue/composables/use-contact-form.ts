import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject, type MaybeRefOrGetter, ref, type Ref, toValue, useId } from 'vue'
import { ConvexAuthStateKey, useAction } from 'nuxt-convex-module/client'
import { backendError } from '../../../convex/errors.js'
import { CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN, contactProblem } from '../../../convex/inbound-rules.js'
import { useActiveLocale } from '../utils/active-locale'
import { type BackendError, failureOf } from '../utils/backend-error'
import { useBackendNamespace } from '../utils/namespace'
import { useHumanCheck } from './use-human-check'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn } from './use-labels'

/** Where a contact form is: waiting for a message, sending one, done, refused by the deployment, or failed on the way. */
export type ContactFormState = 'ready' | 'pending' | 'sent' | 'error' | 'refused'

/** The fields a contact message is checked on. */
export type ContactField = 'name' | 'email' | 'message'

/** The functions of `email.api` the form reads. */
export interface ContactApiRefs {
  submitContactMessage?: FunctionReference<'action', 'public', { name?: string, email?: string, message: string, website?: string, locale?: string, human?: string | null }, { sent: true }>
}

export interface UseContactFormOptions {
  /** Override the injected `api.email` namespace. */
  api?: ContactApiRefs
  /** Copy for this form, over app config and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'contact'> | undefined>
  /** Called once the deployment stored the message. */
  onSent?: () => void
  /** Called with a refusal or a failure. */
  onError?: (error: BackendError) => void
}

export interface UseContactFormReturn {
  /** Where the form is. */
  state: ComputedRef<ContactFormState>
  /** `true` while a message is on its way. */
  isPending: ComputedRef<boolean>
  /** Whether a signed-in account sends: then only the message is asked for. */
  signedIn: ComputedRef<boolean>
  /** The sender's name (a visitor's). */
  name: Ref<string>
  /** The address to answer (a visitor's). */
  email: Ref<string>
  /** The message, 10 to 2,000 characters. */
  message: Ref<string>
  /** The honeypot: a field people never see. Leave it empty. */
  website: Ref<string>
  /** Characters in the message so far, trimmed. */
  count: ComputedRef<number>
  /** Why the last send was refused or failed; `null` otherwise. Cleared when the next one starts. */
  error: Readonly<Ref<BackendError | null>>
  /** The field the last refusal names, when it names one. */
  errorField: ComputedRef<ContactField | null>
  /** How long to wait before another message, in seconds, after a `rate_limited` refusal. */
  retryAfter: ComputedRef<number | null>
  /** Check and send the message. Resolves `true` once the deployment stored it, `false` otherwise; never rejects. */
  send: () => Promise<boolean>
  /** Clear the message and the confirmation, to write another. */
  reset: () => void
  /** What the live region says: the message is on its way, or was sent. */
  announcement: ComputedRef<string>
  /** The form's words, for markup of your own. */
  labels: UseLabelsReturn<'contact'>
  /** Attribute bindings, with the accessibility attributes and the handlers, for markup of your own. */
  bind: {
    /** The `<form>`: `data-contact="form"`, `data-state`, and the submit handler. */
    root: ComputedRef<Record<string, unknown>>
    nameInput: ComputedRef<Record<string, unknown>>
    emailInput: ComputedRef<Record<string, unknown>>
    messageInput: ComputedRef<Record<string, unknown>>
    /** The line under the message that says how long it may be and how many characters it has. */
    hint: ComputedRef<Record<string, unknown>>
    /** The hidden honeypot field; render it inside an element with the `hidden` attribute. */
    honeypotInput: ComputedRef<Record<string, unknown>>
    /** The submit button, `aria-disabled` while a message is on its way. */
    submit: ComputedRef<Record<string, unknown>>
    /** The live region. */
    status: ComputedRef<Record<string, unknown>>
    /** The refusal. */
    errorText: ComputedRef<Record<string, unknown>>
  }
}

/** A failure that is the deployment's decision about the message, rather than a failure on the way. */
const isRefusal = (error: BackendError): boolean => error.code === 'invalid_input' || error.code === 'forbidden' || error.code === 'rate_limited'

/**
 * The contact form without its markup: a name and an address for a visitor,
 * the message alone for a signed-in account (so the same form on a page
 * behind sign-in is a feedback form), the bot check, a honeypot, and the
 * deployment's refusals. `<ContactForm>` is this with the package's markup.
 * Needs `submitContactMessage` re-exported from `email.api` in
 * `backend/email.ts`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const form = useContactForm()
 * </script>
 * <template>
 *   <form v-bind="form.bind.root.value">
 *     <textarea v-model="form.message.value" v-bind="form.bind.messageInput.value" />
 *     <button v-bind="form.bind.submit.value">Send</button>
 *     <p v-bind="form.bind.status.value">{{ form.announcement.value }}</p>
 *   </form>
 * </template>
 * ```
 */
export function useContactForm(options: UseContactFormOptions = {}): UseContactFormReturn {
  const labels = useLabels('contact', () => toValue(options.labels))
  const api = useBackendNamespace<ContactApiRefs>('email', 'useContactForm', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const human = useHumanCheck()
  const activeLocale = useActiveLocale()
  const run = api.submitContactMessage ? useAction(api.submitContactMessage) : null
  const id = useId() ?? `contact-${Math.random().toString(36).slice(2)}`
  const ids = { name: `${id}-name`, email: `${id}-email`, message: `${id}-message`, hint: `${id}-hint`, status: `${id}-status`, error: `${id}-error` }

  const name = ref('')
  const email = ref('')
  const message = ref('')
  const website = ref('')
  const phase = ref<ContactFormState>('ready')
  const error = ref<BackendError | null>(null)

  const signedIn = computed(() => auth?.isAuthenticated.value === true)
  const count = computed(() => message.value.trim().length)
  const errorField = computed<ContactField | null>(() => {
    const field = error.value?.code === 'invalid_input' ? error.value.data.field : null
    return field === 'name' || field === 'email' || field === 'message' ? field : null
  })
  const retryAfter = computed(() => {
    const failure = error.value
    return failure?.code === 'rate_limited' && typeof failure.data.retryAfter === 'number' ? Math.ceil(failure.data.retryAfter / 1000) : null
  })

  function fail(failure: BackendError): false {
    error.value = failure
    phase.value = isRefusal(failure) ? 'refused' : 'error'
    options.onError?.(failure)
    return false
  }

  async function send(): Promise<boolean> {
    if (phase.value === 'pending') return false
    error.value = null
    const problem = contactProblem({ name: name.value, email: email.value, message: message.value }, { signedIn: signedIn.value })
    if (problem) return fail(failureOf(backendError('invalid_input', { field: problem.field, reason: problem.reason }, `[nuxt-backend] <ContactForm>: ${problem.field} is ${problem.reason.replace('_', ' ')}.`)))
    if (!run) return fail(failureOf(new Error('[nuxt-backend] <ContactForm> needs `submitContactMessage` re-exported from setupEmail() in backend/email.ts (`export const { submitContactMessage } = email.api`).')))
    phase.value = 'pending'
    try {
      const token = await human.token('contact', signedIn.value ? undefined : email.value.trim().toLowerCase())
      await run({
        message: message.value,
        ...(signedIn.value ? {} : { name: name.value, email: email.value }),
        ...(website.value ? { website: website.value } : {}),
        ...(activeLocale() ? { locale: activeLocale()! } : {}),
        human: token,
      })
    }
    catch (cause) {
      return fail(failureOf(cause))
    }
    phase.value = 'sent'
    message.value = ''
    options.onSent?.()
    return true
  }

  function reset() {
    message.value = ''
    error.value = null
    phase.value = 'ready'
  }

  const announcement = computed(() => phase.value === 'pending' ? labels.t('sending') : phase.value === 'sent' ? labels.t('sent') : '')
  const invalid = (field: ContactField) => (errorField.value === field ? 'true' : undefined)
  const described = (...parts: Array<string | false>) => parts.filter(Boolean).join(' ') || undefined

  const bind: UseContactFormReturn['bind'] = {
    root: computed(() => ({
      'data-contact': 'form',
      'data-state': phase.value,
      'aria-busy': phase.value === 'pending' || undefined,
      'novalidate': true,
      'onSubmit': (event: Event) => {
        event.preventDefault()
        void send()
      },
    })),
    nameInput: computed(() => ({ 'id': ids.name, 'name': 'name', 'type': 'text', 'autocomplete': 'name', 'maxlength': 100, 'required': true, 'data-contact': 'input-name', 'aria-invalid': invalid('name'), 'aria-describedby': described(errorField.value === 'name' && ids.error), 'value': name.value, 'onInput': (event: Event) => { name.value = (event.target as HTMLInputElement).value } })),
    emailInput: computed(() => ({ 'id': ids.email, 'name': 'email', 'type': 'email', 'autocomplete': 'email', 'maxlength': 254, 'required': true, 'data-contact': 'input-email', 'aria-invalid': invalid('email'), 'aria-describedby': described(errorField.value === 'email' && ids.error), 'value': email.value, 'onInput': (event: Event) => { email.value = (event.target as HTMLInputElement).value } })),
    messageInput: computed(() => ({
      'id': ids.message,
      'name': 'message',
      'required': true,
      'minlength': CONTACT_MESSAGE_MIN,
      'maxlength': CONTACT_MESSAGE_MAX,
      'data-contact': 'input-message',
      'aria-invalid': invalid('message'),
      'aria-describedby': described(ids.hint, errorField.value === 'message' && ids.error),
      'value': message.value,
      'onInput': (event: Event) => {
        message.value = (event.target as HTMLTextAreaElement).value
      },
    })),
    honeypotInput: computed(() => ({
      'name': 'website',
      'type': 'text',
      'tabindex': -1,
      'autocomplete': 'off',
      'aria-hidden': 'true',
      'aria-label': labels.t('trap'),
      'data-contact': 'input-trap',
      'value': website.value,
      'onInput': (event: Event) => {
        website.value = (event.target as HTMLInputElement).value
      },
    })),
    hint: computed(() => ({ 'id': ids.hint, 'data-contact': 'hint' })),
    submit: computed(() => ({ 'type': 'submit', 'data-contact': 'submit', 'aria-disabled': phase.value === 'pending' || undefined })),
    status: computed(() => ({ 'id': ids.status, 'role': 'status', 'aria-live': 'polite', 'data-contact': 'status' })),
    errorText: computed(() => ({ 'id': ids.error, 'role': 'alert', 'data-contact': 'error' })),
  }

  return {
    state: computed(() => phase.value),
    isPending: computed(() => phase.value === 'pending'),
    signedIn,
    name,
    email,
    message,
    website,
    count,
    error,
    errorField,
    retryAfter,
    send,
    reset,
    announcement,
    labels,
    bind,
  }
}
