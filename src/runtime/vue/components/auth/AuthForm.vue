<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useLoginFlow, type LoginStep, type UseLoginFlowReturn } from '../../composables/use-login-flow'
import { preloadPasskeyCeremony } from '../../passkey-client'
import { loginBindings } from '../../utils/login-bindings'
import { provideAuthFormView, useAuthTitle, type AuthFormSlots } from './auth-form'

/**
 * The complete passwordless sign-in flow (passkeys + email OTP) in one
 * component: semantic markup where every element carries a `data-auth`
 * attribute, built from parts (`AuthFormChoose`, `AuthFormCode`, …) that a
 * same-named component of the app's replaces, and a slot per step.
 *
 * It opens on the way this browser last signed in and marks that method's
 * button "Last used", and offers saved passkeys in the email field's
 * autofill (`useLoginFlow`'s `preferLastMethod` and `autofill`).
 *
 * @example
 * ```vue
 * <AuthForm title="Sign in" @success="navigateTo('/app')" />
 * ```
 */
defineOptions({ name: 'AuthForm' })

const props = withDefaults(defineProps<{
  /**
   * Heading text. Defaults to the `auth.title` label an app set, then
   * "Sign in to {brand.name}", then "Sign in"; an empty string hides it.
   */
  title?: string
  /** Copy for this form, over `appConfig.backend.labels.auth` and the translations. */
  labels?: LabelOverrides<BackendLabels['auth']>
  /** Gate emails before sending (`true` | `false` | custom message). Default: a basic shape check. */
  validateEmail?: (email: string) => boolean | string
}>(), { title: undefined, labels: undefined, validateEmail: undefined })

const emit = defineEmits({
  success: () => true,
  /** A step failed: the sentence `error.message` holds. */
  error: (_message: string) => true,
  step: (_step: LoginStep) => true,
})
const slots = defineSlots<AuthFormSlots>()

const labels = useLabels('auth', () => props.labels)
const title = useAuthTitle(() => props.title, () => props.labels)
const id = useId()
const flow = useLoginFlow({
  validateEmail: props.validateEmail,
  autofill: true,
  preferLastMethod: true,
  onSuccess: () => emit('success'),
})

// Whether this browser can run a passkey ceremony at all, read after mount
// so the server render and the first client render agree. An in-app
// browser or a plain-http origin has no WebAuthn: offering a passkey there
// only ends in an error, so the form leaves it out and goes past the offer.
const passkeys = ref<boolean | null>(null)
onMounted(() => {
  passkeys.value = typeof window.PublicKeyCredential === 'function'
  // Loaded before the tap, which then opens the prompt in its own task.
  preloadPasskeyCeremony()
})
watch([flow.step, passkeys], ([step, supported]) => {
  if (step === 'passkey-offer' && supported === false) void flow.skipPasskey()
})

// Each step replaces the markup that held focus: when the person moved it
// on (a click, a submit), move focus to the new step's first control, so
// keyboard and screen-reader users land where they act. A step the form
// takes by itself (past a passkey offer this browser cannot run) leaves
// focus alone.
const root = ref<HTMLElement | null>(null)
let personMoved = false
// A press while a step runs does nothing: the busy button keeps focus
// (`aria-disabled`, not `disabled`), so it has to refuse the press itself.
const byPerson = <A extends unknown[]>(action: (...args: A) => unknown) => async (...args: A) => {
  if (flow.isPending.value) return
  personMoved = true
  try {
    await action(...args)
  }
  finally {
    await nextTick()
    personMoved = false
  }
}
watch(flow.step, (value) => {
  emit('step', value)
  if (!personMoved) return
  void nextTick(() => {
    root.value?.querySelector<HTMLElement>('[data-auth^="step-"] input, [data-auth^="step-"] button')?.focus()
  })
})
// The sentence the form shows, in the reader's language.
const errorText = computed(() => (flow.error.value ? labels.errorMessage(flow.error.value) : null))
watch(errorText, (value) => {
  if (value) emit('error', value)
})

const ids = { error: `${id}-error`, sent: `${id}-sent`, lastUsed: `${id}-last-used` }
const goTo = byPerson(flow.goTo)
const signInWithPasskey = byPerson(flow.signInWithPasskey)
// What a part and a slot drive the flow with: their buttons are the person's too.
const slotFlow: UseLoginFlowReturn = {
  ...flow,
  goTo: (step) => {
    void goTo(step)
  },
  signInWithPasskey,
  sendCode: byPerson(flow.sendCode),
  verifyCode: byPerson(flow.verifyCode),
  addPasskey: byPerson(flow.addPasskey),
  skipPasskey: byPerson(flow.skipPasskey),
  recover: byPerson(flow.recover),
  redeemInviteCode: byPerson(flow.redeemInviteCode),
  submitAge: byPerson(flow.submitAge),
  bind: loginBindings({
    ...flow,
    signInWithPasskey,
    goTo: step => goTo(step),
    ids,
    // The form's own error element describes a refused field; an `error` slot names its own.
    describesError: () => !slots.error,
    sentText: () => labels.t('sent', { email: flow.email.value }),
    errorText: () => errorText.value,
    // The form moves focus itself, to the first control of the new step.
    movedByPerson: () => false,
  }),
}

provideAuthFormView({
  labels,
  title,
  passkeys,
  errorId: ids.error,
  sentId: ids.sent,
  lastUsedId: ids.lastUsed,
  errorText,
})

// In the template: Busy while a passkey ceremony or a code round-trip is in
// flight.
</script>

<template>
  <div
    ref="root"
    data-auth="form"
    :data-state="flow.step.value"
    :data-loading="flow.isPending.value ? '' : undefined"
    :aria-busy="flow.isPending.value ? 'true' : undefined"
  >
    <slot
      name="header"
      v-bind="slotFlow"
    >
      <AuthFormHeader :flow="slotFlow" />
    </slot>
    <slot
      v-if="flow.step.value === 'choose'"
      name="choose"
      v-bind="slotFlow"
    >
      <AuthFormChoose :flow="slotFlow" />
    </slot>
    <slot
      v-else-if="flow.step.value === 'request-code'"
      name="request-code"
      v-bind="slotFlow"
    >
      <AuthFormEmail :flow="slotFlow" />
    </slot>
    <slot
      v-else-if="flow.step.value === 'verify-code'"
      name="verify-code"
      v-bind="slotFlow"
    >
      <AuthFormCode :flow="slotFlow" />
    </slot>
    <slot
      v-else-if="flow.step.value === 'recover'"
      name="recover"
      v-bind="slotFlow"
    >
      <AuthFormRecover :flow="slotFlow" />
    </slot>
    <slot
      v-else-if="flow.step.value === 'waitlisted'"
      name="waitlisted"
      v-bind="slotFlow"
    >
      <AuthFormWaitlisted :flow="slotFlow" />
    </slot>
    <slot
      v-else-if="flow.step.value === 'invite-code'"
      name="invite-code"
      v-bind="slotFlow"
    >
      <AuthFormInviteCode :flow="slotFlow" />
    </slot>
    <slot
      v-else-if="flow.step.value === 'age'"
      name="age"
      v-bind="slotFlow"
    >
      <AuthFormAge :flow="slotFlow" />
    </slot>
    <slot
      v-else-if="flow.step.value === 'undeliverable'"
      name="undeliverable"
      v-bind="slotFlow"
    >
      <AuthFormUndeliverable :flow="slotFlow" />
    </slot>
    <slot
      v-else-if="flow.step.value === 'passkey-offer'"
      name="passkey-offer"
      v-bind="slotFlow"
    >
      <AuthFormPasskeyOffer :flow="slotFlow" />
    </slot>
    <!-- Every required consent, linked, under the steps that can create an account. -->
    <AuthFormAgreement :flow="slotFlow" />
    <slot
      v-if="errorText"
      name="error"
      v-bind="slotFlow"
    >
      <AuthFormError :flow="slotFlow" />
    </slot>
    <slot
      name="footer"
      v-bind="slotFlow"
    />
  </div>
</template>
