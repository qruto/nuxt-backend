import { computed, inject, provide, toValue, type ComputedRef, type InjectionKey, type MaybeRefOrGetter, type Ref } from 'vue'
import { useBackendConfig } from '../../composables/use-backend-config'
import { useLabels, type BackendLabels, type LabelOverrides, type UseLabelsReturn } from '../../composables/use-labels'
import type { UseLoginFlowReturn } from '../../composables/use-login-flow'

/**
 * The sign-in heading: the `title` prop, else an `auth.title` the app set
 * (the `labels` prop, then `appConfig.backend.labels.auth.title`), else
 * the `auth.titleBrand` label ("Sign in to {brand}") when a brand name is
 * configured, else the `auth.title` label ("Sign in"). The login page uses
 * the same rule for its document title.
 *
 * @internal
 */
export function useAuthTitle(override?: MaybeRefOrGetter<string | undefined>, labels?: MaybeRefOrGetter<LabelOverrides<BackendLabels['auth']> | undefined>): ComputedRef<string> {
  const config = useBackendConfig()
  const { t } = useLabels('auth', labels)
  return computed(() => {
    const own = toValue(override)
    if (own !== undefined) return own
    if (toValue(labels)?.title !== undefined || config.labels.auth?.title !== undefined) return t('title')
    return config.brand.name ? t('titleBrand', { brand: config.brand.name }) : t('title')
  })
}

/**
 * `<AuthForm>`'s slots: one per step, plus the regions around them. Every
 * slot receives the whole login flow (`UseLoginFlowReturn`) as its props, so
 * a custom step reads and drives the same refs and actions the built-in
 * markup does. The names and their props are stable.
 */
export interface AuthFormSlots {
  /** Above the step: replaces the logo and the title. */
  'header': (flow: UseLoginFlowReturn) => unknown
  /** The first step: the passkey button and "Continue with email code", the one this browser last signed in with marked "Last used" (`lastMethod`). */
  'choose': (flow: UseLoginFlowReturn) => unknown
  /** The email (and name) form that sends a code. */
  'request-code': (flow: UseLoginFlowReturn) => unknown
  /** The code form. */
  'verify-code': (flow: UseLoginFlowReturn) => unknown
  /** The offer to save a passkey after a code sign-in, and the passkey a recovery requires (`passkeyRequired`). */
  'passkey-offer': (flow: UseLoginFlowReturn) => unknown
  /** "Lost your passkey?": the address and the recovery code of a passkey-only account. */
  'recover': (flow: UseLoginFlowReturn) => unknown
  /** A new address while the app is in early access, with no ticket: it is on the waitlist, and may have an invite code. */
  'waitlisted': (flow: UseLoginFlowReturn) => unknown
  /** A new address while the app is invite only, with no ticket: the invite code field. */
  'invite-code': (flow: UseLoginFlowReturn) => unknown
  /** A new address, when the app sets a minimum age: the question "How old are you?", asked once. */
  'age': (flow: UseLoginFlowReturn) => unknown
  /** An address the email provider stopped delivering to: no code was sent, the same words for new and existing accounts, and a way back to try another address. */
  'undeliverable': (flow: UseLoginFlowReturn) => unknown
  /** Why the last step failed; rendered only while `error` is set. */
  'error': (flow: UseLoginFlowReturn) => unknown
  /** Below everything. */
  'footer': (flow: UseLoginFlowReturn) => unknown
}

/** What `<AuthForm>` hands its packaged parts beside the `flow` prop: its words, its title and what it knows of the browser. */
export interface AuthFormView {
  /** The form's labels: its `labels` prop over the app's. */
  labels: UseLabelsReturn<'auth'>
  /** The heading, `''` for none. */
  title: ComputedRef<string>
  /** Whether this browser can run a passkey ceremony; `null` until mounted. */
  passkeys: Ref<boolean | null>
  /** The id of the failure message, which a refused field is described by. */
  errorId: string
  /** The id of the sent-code note. */
  sentId: string
  /** The id of the "Last used" mark, which describes its button. */
  lastUsedId: string
  /** The sentence for the current failure, or `null`. */
  errorText: ComputedRef<string | null>
}

const AUTH_FORM_VIEW: InjectionKey<AuthFormView> = Symbol('nuxt-backend:auth-form')

/** @internal */
export function provideAuthFormView(view: AuthFormView): void {
  provide(AUTH_FORM_VIEW, view)
}

/**
 * The view of the `<AuthForm>` a packaged part renders in.
 *
 * @internal
 */
export function useAuthFormView(part: string): AuthFormView {
  const view = inject(AUTH_FORM_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <AuthForm>, which gives it the login flow. To build a sign-in form of your own, use useLoginFlow() and its bindings.`)
  return view
}

/**
 * The accessibility attributes of a field of `<AuthForm>` that the bindings
 * do not cover (the name, the recovery code, the invite code, the age): it
 * reads as refused while the last step's `invalid_input` names it, and is
 * described by the failure message then.
 *
 * @internal
 */
export function fieldState(flow: UseLoginFlowReturn, view: Pick<AuthFormView, 'errorId' | 'errorText'>, field: string): Record<string, string | undefined> {
  const error = flow.error.value
  const refused = error?.code === 'invalid_input' && (error.data as { field?: unknown }).field === field
  return {
    'aria-invalid': refused ? 'true' : undefined,
    'data-invalid': refused ? '' : undefined,
    'aria-describedby': refused && view.errorText.value ? view.errorId : undefined,
  }
}
