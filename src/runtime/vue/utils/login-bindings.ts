import type { ComputedRef, Ref, VNode } from 'vue'
import { busyAttributes } from '../a11y'
import { AUTOFILL_AUTOCOMPLETE } from '../passkey-client'
import type { BackendError } from './backend-error'
import type { SignInMethod } from './auth-session'
import type { LoginStep } from '../composables/use-login-flow'

/** The steps of the login flow the bindings move between. */
type Step = LoginStep

/** The attribute and handler bags `useLoginFlow().bind` holds, one per element of a sign-in form. */
export interface LoginBindings {
  /** The email `<input>`: its type, `autocomplete="username webauthn"` for passkey autofill, and the refusal when it names the address. */
  readonly emailInput: Record<string, unknown>
  /** The code `<input>`: numeric, `autocomplete="one-time-code"`, the refusal's description, and focus when the person opened its step. */
  readonly codeInput: Record<string, unknown>
  /** The step's submit button: `type="submit"`, and `aria-disabled` while a step runs, so it keeps focus. */
  readonly submit: Record<string, unknown>
  /** The passkey button: its click handler, and `aria-disabled` while the browser's prompt is open. */
  readonly passkeyButton: Record<string, unknown>
  /** The button back to the previous step, which puts focus on the field it returns to. */
  readonly back: Record<string, unknown>
  /** An empty element: a polite status that says a code was sent, and an alert that says why a step failed. */
  readonly status: Record<string, unknown>
}

/** What the bindings read and call. */
export interface LoginBindingsContext {
  step: Ref<Step>
  isPending: ComputedRef<boolean> | Ref<boolean>
  error: Ref<BackendError | null>
  lastMethod: ComputedRef<SignInMethod | null> | Ref<SignInMethod | null>
  email: Ref<string>
  signInWithPasskey: () => unknown
  goTo: (step: Step) => unknown
  /** The ids the bindings point at, unique to the form. */
  ids: { error: string, sent: string, lastUsed: string }
  /** Whether the element `ids.error` names is in the page: a refused field is described by it. */
  describesError?: () => boolean
  /** The status words: the sent-code note on the code step. */
  sentText: () => string
  /** The sentence for the current failure, or `null`. */
  errorText: () => string | null
  /** Whether the person moved the form to the step on screen, so a field it opens may take focus. */
  movedByPerson: () => boolean
}

/** The step the back button returns to. */
const PREVIOUS: Record<Step, Step> = {
  'choose': 'choose',
  'request-code': 'choose',
  'verify-code': 'request-code',
  'passkey-offer': 'choose',
  'recover': 'choose',
  'waitlisted': 'request-code',
  'invite-code': 'request-code',
  'age': 'request-code',
  'undeliverable': 'request-code',
}

/** Focus a field once the person opened its step. */
const focusOnMount = (context: LoginBindingsContext) => (vnode: VNode) => {
  if (context.movedByPerson()) (vnode.el as HTMLElement | null)?.focus()
}

/**
 * The bindings of a login flow: the attributes and handlers each element of a
 * sign-in form needs, accessibility included. `useLoginFlow().bind` and the
 * packaged `<AuthForm>` parts spread the same bags.
 */
export function loginBindings(context: LoginBindingsContext): LoginBindings {
  const invalid = (field: string) => {
    const error = context.error.value
    return error?.code === 'invalid_input' && (error.data as { field?: unknown }).field === field
  }
  const fieldState = (field: string, describedBy: string[] = []) => {
    const refused = invalid(field)
    const ids = refused && (context.describesError?.() ?? true) ? [...describedBy, context.ids.error] : describedBy
    return {
      'aria-invalid': refused ? 'true' : undefined,
      'data-invalid': refused ? '' : undefined,
      'aria-describedby': ids.length ? ids.join(' ') : undefined,
    }
  }
  const busy = () => busyAttributes(context.isPending.value)
  return {
    get emailInput() {
      return {
        type: 'email',
        autocomplete: AUTOFILL_AUTOCOMPLETE,
        spellcheck: 'false',
        required: true,
        onVnodeMounted: focusOnMount(context),
        ...fieldState('email'),
      }
    },
    get codeInput() {
      return {
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'one-time-code',
        required: true,
        onVnodeMounted: focusOnMount(context),
        ...fieldState('otp', context.step.value === 'verify-code' ? [context.ids.sent] : []),
      }
    },
    get submit() {
      return { type: 'submit', ...busy() }
    },
    get passkeyButton() {
      return {
        'type': 'button',
        ...busy(),
        'aria-describedby': context.lastMethod.value === 'passkey' ? context.ids.lastUsed : undefined,
        'onClick': () => context.signInWithPasskey(),
      }
    },
    get back() {
      return { type: 'button', ...busy(), onClick: () => context.goTo(PREVIOUS[context.step.value]) }
    },
    get status() {
      const failure = context.errorText()
      const sent = context.step.value === 'verify-code' ? context.sentText() : ''
      return {
        'id': failure ? context.ids.error : context.ids.sent,
        'role': failure ? 'alert' : 'status',
        'aria-live': failure ? 'assertive' : 'polite',
        'textContent': failure ?? sent,
      }
    },
  }
}
