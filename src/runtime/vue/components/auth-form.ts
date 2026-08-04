import { defineComponent, h, watch, type PropType, type VNodeChild } from 'vue'
import { useLoginFlow, type LoginStep } from '../composables/use-login-flow'

/**
 * The complete passwordless sign-in flow (passkeys + email OTP) as one
 * headless component: semantic, unstyled markup where every element carries a
 * `data-auth` attribute for styling — or replace any step wholesale via its
 * slot (each slot receives the full {@link UseLoginFlowReturn} flow object).
 *
 * Style it yourself against the `data-auth` hooks, or add the neutral default
 * stylesheet: `css: ['nuxt-backend/auth.css']` in `nuxt.config.ts`.
 *
 * @example
 * ```vue
 * <AuthForm title="Sign in" @success="navigateTo('/app')" />
 *
 * <AuthForm>
 *   <template #verify-code="{ otp, verifyCode, pending }">…custom step…</template>
 * </AuthForm>
 * ```
 */
export const AuthForm = defineComponent({
  name: 'AuthForm',
  props: {
    title: { type: String, default: 'Sign in' },
    /** Offer passkey sign-in and post-OTP passkey enrolment. Default `true`. */
    passkeys: { type: Boolean, default: true },
    /** Offer the email-OTP flow. Default `true`. */
    otp: { type: Boolean, default: true },
    /** Require a name on registration steps. Default `true`. */
    requireName: { type: Boolean, default: true },
    /** Gate emails before sending (`true` | `false` | custom message). */
    validateEmail: { type: Function as PropType<(email: string) => boolean | string>, default: undefined },
  },
  emits: {
    success: () => true,
    error: (_message: string) => true,
    step: (_step: LoginStep) => true,
  },
  setup(props, { slots, emit }) {
    const flow = useLoginFlow({
      requireName: props.requireName,
      validateEmail: props.validateEmail,
      offerPasskey: props.passkeys,
      onSuccess: () => emit('success'),
    })

    watch(flow.step, value => emit('step', value))
    watch(flow.error, (value) => {
      if (value) emit('error', value)
    })

    const textInput = (
      auth: string,
      value: { value: string },
      attrs: Record<string, unknown>,
    ) => h('input', {
      'data-auth': auth,
      'value': value.value,
      'onInput': (event: Event) => { value.value = (event.target as HTMLInputElement).value },
      ...attrs,
    })

    const nameField = (optional: boolean) => h('label', { 'data-auth': 'label-name' }, [
      optional ? 'Name (for new accounts)' : 'Name',
      textInput('input-name', flow.name, { type: 'text', autocomplete: 'name', required: !optional }),
    ])

    const emailField = () => h('label', { 'data-auth': 'label-email' }, [
      'Email',
      textInput('input-email', flow.email, { type: 'email', autocomplete: 'email', spellcheck: 'false', required: true }),
    ])

    const backButton = (target: LoginStep = 'choose') => h('button', {
      'data-auth': 'back',
      'type': 'button',
      'disabled': flow.pending.value,
      'onClick': () => flow.goTo(target),
    }, 'Back')

    const steps: Record<LoginStep, () => VNodeChild> = {
      'choose': () => h('section', { 'data-auth': 'step-choose' }, [
        ...(props.passkeys
          ? [h('button', { 'data-auth': 'passkey-sign-in', 'type': 'button', 'disabled': flow.pending.value, 'onClick': flow.signInWithPasskey }, flow.pending.value ? 'Waiting…' : 'Sign in with passkey')]
          : []),
        ...(props.passkeys && props.otp ? [h('div', { 'data-auth': 'divider' }, 'or')] : []),
        ...(props.otp
          ? [h('button', { 'data-auth': 'otp-start', 'type': 'button', 'disabled': flow.pending.value, 'onClick': () => flow.goTo('request-code') }, 'Continue with email code')]
          : []),
      ]),
      'request-code': () => h('form', {
        'data-auth': 'step-request-code',
        'onSubmit': (event: Event) => {
          event.preventDefault()
          void flow.sendCode()
        },
      }, [
        ...(props.requireName ? [nameField(true)] : []),
        emailField(),
        h('button', { 'data-auth': 'submit', 'type': 'submit', 'disabled': flow.pending.value || !flow.emailValid.value }, flow.pending.value ? 'Sending…' : 'Email me a code'),
        backButton(),
      ]),
      'verify-code': () => h('form', {
        'data-auth': 'step-verify-code',
        'onSubmit': (event: Event) => {
          event.preventDefault()
          void flow.verifyCode()
        },
      }, [
        h('p', { 'data-auth': 'sent-note' }, `We sent a code to ${flow.email.value}.`),
        h('label', { 'data-auth': 'label-otp' }, [
          'Verification code',
          textInput('input-otp', flow.otp, { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', required: true }),
        ]),
        h('button', { 'data-auth': 'submit', 'type': 'submit', 'disabled': flow.pending.value }, flow.pending.value ? 'Verifying…' : 'Verify'),
        backButton('request-code'),
      ]),
      'add-passkey': () => h('section', { 'data-auth': 'step-add-passkey' }, [
        h('p', { 'data-auth': 'add-passkey-note' }, 'Save a passkey on this device to sign in instantly next time.'),
        h('button', { 'data-auth': 'passkey-add', 'type': 'button', 'disabled': flow.pending.value, 'onClick': flow.addPasskey }, flow.pending.value ? 'Adding…' : 'Add passkey'),
        h('button', { 'data-auth': 'skip', 'type': 'button', 'disabled': flow.pending.value, 'onClick': flow.skipPasskey }, 'Skip for now'),
      ]),
    }

    return () => h('div', { 'data-auth': 'form' }, [
      slots.header?.(flow) ?? (props.title ? h('h1', { 'data-auth': 'title' }, props.title) : null),
      slots[flow.step.value]?.(flow) ?? steps[flow.step.value](),
      flow.error.value
        ? slots.error?.(flow) ?? h('p', { 'data-auth': 'error', 'role': 'alert' }, flow.error.value)
        : null,
      slots.footer?.(flow) ?? null,
    ])
  },
})
