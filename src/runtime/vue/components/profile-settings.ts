import { computed, defineComponent, h, onMounted, ref, watch, type ComputedRef, type PropType, type Ref, type VNodeChild } from 'vue'
import { useAuth } from '../composables/use-auth'
import { useEmailChange, type UseEmailChangeReturn } from '../composables/use-email-change'
import { useOrganization } from '../composables/use-organization'
import { useBackendConfig } from '../composables/use-backend-config'
import { unwrapAuth } from '../utils/auth-result'
import type { SettingsMessage } from './workspace-settings'

export interface ProfileSlotContext {
  user: Record<string, unknown> | null | undefined
  role: string
  workspaceName: string | null
  initials: string
  name: Ref<string>
  message: SettingsMessage | null
  savingName: boolean
  saveName: () => Promise<void>
  /** The email change, by code at both addresses (see `useEmailChange`). */
  emailChange: UseEmailChangeReturn
}

/**
 * Account profile as one headless component: identity chrome (avatar
 * initials, verification / role / workspace badges), display-name editing,
 * and the email change, by a code from each address. Identity renders client-only
 * — session state differs between SSR and hydration.
 *
 * Headless markup on `data-profile` hooks; replace any region via its slot —
 * each slot receives {@link ProfileSlotContext}.
 */
export const ProfileSettings = /* @__PURE__ */ defineComponent({
  name: 'ProfileSettings',
  props: {
    /** Gate the new email before any code is sent (`true` | `false` | custom message). */
    validateEmail: { type: Function as PropType<(email: string) => boolean | string>, default: undefined },
    showIdentity: { type: Boolean, default: true },
  },
  emits: {
    'name-saved': (_name: string) => true,
    'email-changed': (_newEmail: string) => true,
    'error': (_message: string) => true,
  },
  setup(props, { slots, emit }) {
    const auth = useAuth()
    const workspace = useOrganization()
    const config = useBackendConfig()
    const labels = { ...config.labels.profile }

    // Session state differs between SSR (no session) and hydration — identity
    // chrome only renders after mount.
    const mounted = ref(false)
    onMounted(() => {
      mounted.value = true
    })

    const name = ref('')
    watch(auth.user, (user) => {
      if (user && !name.value) name.value = (user.name as string | undefined) ?? ''
    }, { immediate: true })

    const message: Ref<SettingsMessage | null> = ref(null)
    const savingName = ref(false)

    const initials: ComputedRef<string> = computed(() =>
      ((auth.user.value?.name as string | undefined) ?? (auth.user.value?.email as string | undefined) ?? '?')
        .split(/[\s@]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join(''))

    function fail(e: unknown) {
      const text = e instanceof Error ? e.message : 'Something went wrong'
      message.value = { text, ok: false }
      emit('error', text)
    }

    async function saveName() {
      message.value = null
      savingName.value = true
      try {
        unwrapAuth(await auth.updateUser({ name: name.value.trim() }))
        message.value = { text: 'Name updated.', ok: true }
        emit('name-saved', name.value.trim())
      }
      catch (e) {
        fail(e)
      }
      finally {
        savingName.value = false
      }
    }

    const emailChange = useEmailChange({
      validateEmail: email => props.validateEmail?.(email) ?? true,
      onChanged: (email) => {
        message.value = { text: `Your email address is now ${email}.`, ok: true }
        emit('email-changed', email)
        emailChange.reset()
      },
    })
    // A step that failed says why where every other message goes.
    watch(emailChange.error, (text) => {
      if (!text) return
      message.value = { text, ok: false }
      emit('error', text)
    })

    const context = (): ProfileSlotContext => ({
      user: auth.user.value,
      role: auth.role.value,
      workspaceName: workspace.current.value?.name ?? null,
      initials: initials.value,
      name,
      message: message.value,
      savingName: savingName.value,
      saveName,
      emailChange,
    })

    const identity = (): VNodeChild => {
      const ctx = context()
      if (slots.identity) return slots.identity(ctx)
      if (!mounted.value) return h('div', { 'data-profile': 'identity', 'data-loading': true, 'aria-busy': 'true' })
      const user = auth.user.value
      return h('div', { 'data-profile': 'identity' }, [
        h('span', { 'data-profile': 'avatar', 'aria-hidden': 'true' }, initials.value),
        h('div', { 'data-profile': 'identity-meta' }, [
          h('span', { 'data-profile': 'identity-name' }, (user?.name as string | undefined) ?? '—'),
          h('span', { 'data-profile': 'identity-email' }, (user?.email as string | undefined) ?? ''),
        ]),
        h('div', { 'data-profile': 'badges' }, [
          h('span', { 'data-profile': 'badge', 'data-tone': user?.emailVerified ? 'ok' : 'warn' }, user?.emailVerified ? 'Email verified' : 'Email unverified'),
          h('span', { 'data-profile': 'badge', 'data-tone': 'muted' }, `Role: ${auth.role.value}`),
          workspace.current.value?.name
            ? h('span', { 'data-profile': 'badge', 'data-tone': 'muted' }, workspace.current.value.name)
            : null,
        ]),
      ])
    }

    const nameSection = (): VNodeChild => {
      const ctx = context()
      if (slots.name) return slots.name(ctx)
      return h('form', {
        'data-profile': 'section-name',
        'onSubmit': (event: Event) => {
          event.preventDefault()
          void saveName()
        },
      }, [
        h('label', { 'data-profile': 'label-name' }, [
          'Display name',
          h('input', {
            'data-profile': 'input-name',
            'type': 'text',
            'autocomplete': 'name',
            'value': name.value,
            'onInput': (event: Event) => { name.value = (event.target as HTMLInputElement).value },
          }),
        ]),
        h('button', { 'data-profile': 'save', 'type': 'submit', 'disabled': savingName.value }, savingName.value ? '…' : labels.save ?? 'Save name'),
      ])
    }

    /** The code step's form: where the code went, the code, submit and cancel. */
    const codeForm = (sentTo: string, submitLabel: string, submit: () => Promise<void>, hint: string): VNodeChild =>
      h('form', {
        'data-profile': 'section-email',
        'data-step': emailChange.step.value,
        'onSubmit': (event: Event) => {
          event.preventDefault()
          void submit()
        },
      }, [
        h('label', { 'data-profile': 'label-code' }, [
          `Code sent to ${sentTo}`,
          h('input', {
            'data-profile': 'input-code',
            'type': 'text',
            'inputmode': 'numeric',
            'autocomplete': 'one-time-code',
            'required': true,
            'value': emailChange.otp.value,
            'onInput': (event: Event) => { emailChange.otp.value = (event.target as HTMLInputElement).value },
          }),
        ]),
        h('p', { 'data-profile': 'hint' }, hint),
        h('button', { 'data-profile': 'submit', 'type': 'submit', 'disabled': emailChange.pending.value }, emailChange.pending.value ? '…' : submitLabel),
        h('button', { 'data-profile': 'cancel', 'type': 'button', 'disabled': emailChange.pending.value, 'onClick': () => emailChange.reset() }, 'Cancel'),
      ])

    const emailSection = (): VNodeChild => {
      const ctx = context()
      if (slots.email) return slots.email(ctx)
      const step = emailChange.step.value
      if (step === 'confirm-current') {
        return codeForm(
          (auth.user.value?.email as string | undefined) ?? 'your current address',
          'Confirm',
          emailChange.confirmCurrent,
          'This proves you still hold your current address. Next, a code goes to the new one.',
        )
      }
      if (step === 'verify-new') {
        return codeForm(
          emailChange.newEmail.value.trim(),
          labels.changeEmail ?? 'Change email',
          emailChange.verifyNew,
          'No code? An address that already belongs to an account receives none.',
        )
      }
      return h('form', {
        'data-profile': 'section-email',
        'data-step': step,
        'onSubmit': (event: Event) => {
          event.preventDefault()
          void emailChange.start()
        },
      }, [
        h('label', { 'data-profile': 'label-email' }, [
          'New email address',
          h('input', {
            'data-profile': 'input-email',
            'type': 'email',
            'autocomplete': 'email',
            'spellcheck': 'false',
            'required': true,
            'value': emailChange.newEmail.value,
            'onInput': (event: Event) => { emailChange.newEmail.value = (event.target as HTMLInputElement).value },
          }),
        ]),
        h('p', { 'data-profile': 'hint' }, 'You confirm with a code from your current address, then one from the new address.'),
        h('button', { 'data-profile': 'submit', 'type': 'submit', 'disabled': emailChange.pending.value }, emailChange.pending.value ? '…' : labels.changeEmail ?? 'Change email'),
      ])
    }

    return () => h('div', { 'data-profile': 'root', 'aria-busy': savingName.value || emailChange.pending.value ? 'true' : undefined }, [
      props.showIdentity ? identity() : null,
      nameSection(),
      emailSection(),
      // A failure interrupts (`alert` is implicitly assertive); a
      // confirmation waits its turn as a polite status.
      message.value
        ? h('p', {
            'data-profile': 'message',
            'data-tone': message.value.ok ? 'ok' : 'error',
            'role': message.value.ok ? 'status' : 'alert',
            'aria-live': message.value.ok ? 'polite' : undefined,
          }, message.value.text)
        : null,
      slots.footer?.(context()) ?? null,
    ])
  },
})
