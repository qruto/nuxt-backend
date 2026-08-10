import { computed, defineComponent, h, onMounted, ref, watch, type ComputedRef, type PropType, type Ref, type VNodeChild } from 'vue'
import { useRoute } from '#imports'
import { useAuth } from '../composables/use-auth'
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
  newEmail: Ref<string>
  message: SettingsMessage | null
  savingName: boolean
  changingEmail: boolean
  saveName: () => Promise<void>
  requestEmailChange: () => Promise<void>
}

/**
 * Account profile as one headless component: identity chrome (avatar
 * initials, verification / role / workspace badges), display-name editing,
 * and the two-step confirmed change-email flow. Identity renders client-only
 * — session state differs between SSR and hydration.
 *
 * Headless markup on `data-profile` hooks; replace any region via its slot —
 * each slot receives {@link ProfileSlotContext}.
 */
export const ProfileSettings = defineComponent({
  name: 'ProfileSettings',
  props: {
    /** Gate the new email before submitting (`true` | `false` | custom message). */
    validateEmail: { type: Function as PropType<(email: string) => boolean | string>, default: undefined },
    /** Where the change-email confirmation returns to. Default: the current path. */
    callbackPath: { type: String, default: undefined },
    showIdentity: { type: Boolean, default: true },
  },
  emits: {
    'name-saved': (_name: string) => true,
    'email-change-requested': (_newEmail: string) => true,
    'error': (_message: string) => true,
  },
  setup(props, { slots, emit }) {
    const auth = useAuth()
    const workspace = useOrganization()
    const config = useBackendConfig()
    const labels = { ...config.labels.profile }
    const route = useRoute()

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

    const newEmail = ref('')
    const message: Ref<SettingsMessage | null> = ref(null)
    const savingName = ref(false)
    const changingEmail = ref(false)

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

    async function requestEmailChange() {
      const target = newEmail.value.trim()
      const verdict = props.validateEmail?.(target)
      if (typeof verdict === 'string' || verdict === false) {
        message.value = { text: typeof verdict === 'string' ? verdict : 'That email address is not allowed.', ok: false }
        return
      }
      message.value = null
      changingEmail.value = true
      try {
        unwrapAuth(await auth.changeEmail(target, props.callbackPath ?? route.path))
        message.value = { text: `Confirmation sent to ${auth.user.value?.email} — approve it, then verify the new address.`, ok: true }
        emit('email-change-requested', target)
        newEmail.value = ''
      }
      catch (e) {
        fail(e)
      }
      finally {
        changingEmail.value = false
      }
    }

    const context = (): ProfileSlotContext => ({
      user: auth.user.value,
      role: auth.role.value,
      workspaceName: workspace.current.value?.name ?? null,
      initials: initials.value,
      name,
      newEmail,
      message: message.value,
      savingName: savingName.value,
      changingEmail: changingEmail.value,
      saveName,
      requestEmailChange,
    })

    const identity = (): VNodeChild => {
      const ctx = context()
      if (slots.identity) return slots.identity(ctx)
      if (!mounted.value) return h('div', { 'data-profile': 'identity', 'data-loading': true })
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

    const emailSection = (): VNodeChild => {
      const ctx = context()
      if (slots.email) return slots.email(ctx)
      return h('form', {
        'data-profile': 'section-email',
        'onSubmit': (event: Event) => {
          event.preventDefault()
          void requestEmailChange()
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
            'value': newEmail.value,
            'onInput': (event: Event) => { newEmail.value = (event.target as HTMLInputElement).value },
          }),
        ]),
        h('p', { 'data-profile': 'hint' }, 'Changing email is confirmed from both inboxes: the current address approves, the new one verifies.'),
        h('button', { 'data-profile': 'submit', 'type': 'submit', 'disabled': changingEmail.value }, changingEmail.value ? '…' : labels.changeEmail ?? 'Change email'),
      ])
    }

    return () => h('div', { 'data-profile': 'root' }, [
      props.showIdentity ? identity() : null,
      nameSection(),
      emailSection(),
      message.value
        ? h('p', { 'data-profile': 'message', 'data-tone': message.value.ok ? 'ok' : 'error', 'role': 'status' }, message.value.text)
        : null,
      slots.footer?.(context()) ?? null,
    ])
  },
})
