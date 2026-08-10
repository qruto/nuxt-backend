import { defineComponent, h, onMounted, ref, type PropType, type Ref, type VNodeChild } from 'vue'
import { useRoute } from '#imports'
import { useAuth } from '../composables/use-auth'
import { usePasskeys, type UsePasskeysReturn, type Passkey } from '../composables/use-passkeys'
import { useSessions, describeUserAgent, type UseSessionsReturn, type SessionInfo } from '../composables/use-sessions'
import { useBackendConfig } from '../composables/use-backend-config'
import { unwrapAuth } from '../utils/auth-result'
import type { SettingsMessage } from './workspace-settings'

export type SecuritySection = 'verification' | 'passkeys' | 'sessions' | 'danger'

export interface SecuritySlotContext {
  user: Record<string, unknown> | null | undefined
  passkeys: UsePasskeysReturn
  sessions: UseSessionsReturn
  message: SettingsMessage | null
  pending: string | null
  sendVerification: () => Promise<void>
  requestDeletion: () => Promise<void>
  signOut: () => Promise<void>
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleString()
}

/**
 * Everything that guards the account, as one headless component: email
 * verification, passkey management (add / inline rename / remove), active
 * device sessions (revoke one / revoke others), and the confirmed-by-email
 * account-deletion danger zone. Built entirely on `useAuth`, `usePasskeys`
 * and `useSessions` — no raw auth-client calls.
 *
 * Headless markup on `data-security` hooks; replace any region via its slot —
 * each slot receives {@link SecuritySlotContext}. Destructive actions go
 * through the `confirm` prop (default: `window.confirm`).
 */
export const SecuritySettings = defineComponent({
  name: 'SecuritySettings',
  props: {
    sections: {
      type: Array as PropType<SecuritySection[]>,
      default: () => ['verification', 'passkeys', 'sessions', 'danger'] as SecuritySection[],
    },
    /** Confirm destructive actions; return `false` to abort. Default: `window.confirm`. */
    confirm: { type: Function as PropType<(message: string) => boolean | Promise<boolean>>, default: undefined },
    /** Where the verification email returns to. Default: the current path. */
    callbackPath: { type: String, default: undefined },
  },
  emits: {
    'verification-sent': () => true,
    'passkey-added': () => true,
    'passkey-removed': (_id: string) => true,
    'session-revoked': (_token: string) => true,
    'sessions-revoked': () => true,
    'delete-requested': () => true,
    'signed-out': () => true,
    'error': (_message: string) => true,
  },
  setup(props, { slots, emit }) {
    const auth = useAuth()
    const passkeys = usePasskeys()
    const sessions = useSessions()
    const config = useBackendConfig()
    const labels = { ...config.labels.security }
    const route = useRoute()

    // Session state differs between SSR and hydration — verification status
    // renders after mount.
    const mounted = ref(false)
    onMounted(() => {
      mounted.value = true
    })

    const message: Ref<SettingsMessage | null> = ref(null)
    const pending: Ref<string | null> = ref(null)
    /** Passkey id whose name is being edited inline. */
    const editing = ref<string | null>(null)
    const editName = ref('')

    async function confirmed(text: string): Promise<boolean> {
      if (props.confirm) return await props.confirm(text)
      return typeof window === 'undefined' ? false : window.confirm(text)
    }

    async function run(key: string, action: () => Promise<unknown>, okText?: string) {
      message.value = null
      pending.value = key
      try {
        await action()
        if (okText) message.value = { text: okText, ok: true }
      }
      catch (e) {
        const text = e instanceof Error ? e.message : 'Something went wrong'
        message.value = { text, ok: false }
        emit('error', text)
      }
      finally {
        pending.value = null
      }
    }

    const sendVerification = () => run('verify', async () => {
      unwrapAuth(await auth.sendVerificationEmail(props.callbackPath ?? route.path))
      emit('verification-sent')
    }, `Verification email sent to ${auth.user.value?.email}.`)

    const addPasskey = () => run('passkey:add', async () => {
      await passkeys.add()
      emit('passkey-added')
    }, 'Passkey registered on this device.')

    const removePasskey = async (row: Passkey) => {
      if (!(await confirmed(`Remove passkey “${row.name ?? row.id}”?`))) return
      await run(`passkey:remove:${row.id}`, async () => {
        await passkeys.remove(row.id)
        emit('passkey-removed', row.id)
      })
    }

    const saveRename = (row: Passkey) => run(`passkey:rename:${row.id}`, async () => {
      const name = editName.value.trim()
      if (name && name !== row.name) await passkeys.rename(row.id, name)
      editing.value = null
    })

    const revokeSession = (row: SessionInfo) => run(`session:${row.token}`, async () => {
      await sessions.revoke(row.token)
      emit('session-revoked', row.token)
    })

    const revokeOthers = () => run('sessions:others', async () => {
      await sessions.revokeOthers()
      emit('sessions-revoked')
    }, 'Other sessions signed out.')

    const requestDeletion = async () => {
      if (!(await confirmed('Send an account-deletion confirmation email?'))) return
      await run('delete', async () => {
        unwrapAuth(await auth.deleteAccount())
        emit('delete-requested')
      }, 'Deletion confirmation sent — the account is removed once you approve it from the inbox.')
    }

    const signOut = () => run('sign-out', async () => {
      await auth.signOut()
      emit('signed-out')
    })

    const context = (): SecuritySlotContext => ({
      user: auth.user.value,
      passkeys,
      sessions,
      message: message.value,
      pending: pending.value,
      sendVerification,
      requestDeletion,
      signOut,
    })

    const verificationSection = (): VNodeChild => {
      const ctx = context()
      if (slots.verification) return slots.verification(ctx)
      const user = mounted.value ? auth.user.value : null
      return h('section', { 'data-security': 'section-verification' }, [
        h('h3', { 'data-security': 'section-title' }, 'Email verification'),
        h('p', { 'data-security': 'status', 'data-verified': user?.emailVerified === true || undefined },
          !mounted.value ? 'Checking…' : user?.emailVerified ? 'Address verified.' : 'Address unverified — only passkey-first accounts start unverified.'),
        user && user.emailVerified === false
          ? h('button', {
              'data-security': 'send-verification',
              'type': 'button',
              'disabled': pending.value === 'verify',
              'onClick': sendVerification,
            }, pending.value === 'verify' ? '…' : 'Send verification email')
          : null,
      ])
    }

    const passkeyRow = (row: Passkey): VNodeChild => {
      const ctx = { ...context(), entry: row }
      if (slots.passkey) return slots.passkey(ctx)
      const isEditing = editing.value === row.id
      return h('li', { 'data-security': 'passkey', 'data-editing': isEditing || undefined, 'key': row.id }, [
        isEditing
          ? h('input', {
              'data-security': 'input-passkey-name',
              'type': 'text',
              'value': editName.value,
              'onInput': (event: Event) => { editName.value = (event.target as HTMLInputElement).value },
              'onKeydown': (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void saveRename(row)
                }
                if (event.key === 'Escape') editing.value = null
              },
            })
          : h('span', { 'data-security': 'passkey-name' }, row.name || 'Unnamed passkey'),
        h('span', { 'data-security': 'passkey-meta' }, [row.deviceType, formatDate(row.createdAt)].filter(Boolean).join(' · ')),
        isEditing
          ? h('button', { 'data-security': 'rename', 'type': 'button', 'disabled': pending.value === `passkey:rename:${row.id}`, 'onClick': () => saveRename(row) }, 'Save')
          : h('button', {
              'data-security': 'rename',
              'type': 'button',
              'onClick': () => {
                editing.value = row.id
                editName.value = row.name ?? ''
              },
            }, 'Rename'),
        h('button', {
          'data-security': 'remove',
          'type': 'button',
          'disabled': pending.value === `passkey:remove:${row.id}`,
          'onClick': () => removePasskey(row),
        }, 'Remove'),
      ])
    }

    const passkeysSection = (): VNodeChild => {
      const ctx = context()
      if (slots.passkeys) return slots.passkeys(ctx)
      const list = passkeys.passkeys.value
      return h('section', { 'data-security': 'section-passkeys' }, [
        h('h3', { 'data-security': 'section-title' }, 'Passkeys'),
        list && list.length === 0
          ? h('p', { 'data-security': 'passkeys-empty' }, 'No passkeys yet — add one to sign in without codes.')
          : h('ul', { 'data-security': 'passkey-list' }, (list ?? []).map(passkeyRow)),
        h('button', {
          'data-security': 'add-passkey',
          'type': 'button',
          'disabled': pending.value === 'passkey:add',
          'onClick': addPasskey,
        }, pending.value === 'passkey:add' ? '…' : labels.addPasskey ?? 'Add passkey on this device'),
      ])
    }

    const sessionRow = (row: SessionInfo): VNodeChild => {
      const ctx = { ...context(), entry: row }
      if (slots.session) return slots.session(ctx)
      const isCurrent = row.token === sessions.current.value?.token
      return h('li', { 'data-security': 'session', 'data-current': isCurrent || undefined, 'key': row.token }, [
        h('span', { 'data-security': 'session-name' }, describeUserAgent(row.userAgent)),
        h('span', { 'data-security': 'session-meta' }, formatDate(row.createdAt)),
        isCurrent
          ? h('span', { 'data-security': 'current-badge' }, 'This device')
          : h('button', {
              'data-security': 'revoke',
              'type': 'button',
              'disabled': pending.value === `session:${row.token}`,
              'onClick': () => revokeSession(row),
            }, labels.revoke ?? 'Revoke'),
      ])
    }

    const sessionsSection = (): VNodeChild => {
      const ctx = context()
      if (slots.sessions) return slots.sessions(ctx)
      const list = sessions.sessions.value ?? []
      return h('section', { 'data-security': 'section-sessions' }, [
        h('h3', { 'data-security': 'section-title' }, 'Active sessions'),
        h('ul', { 'data-security': 'session-list' }, list.map(sessionRow)),
        h('button', {
          'data-security': 'revoke-others',
          'type': 'button',
          'disabled': pending.value === 'sessions:others' || list.length <= 1,
          'onClick': revokeOthers,
        }, pending.value === 'sessions:others' ? '…' : labels.revokeOthers ?? 'Sign out other sessions'),
      ])
    }

    const dangerSection = (): VNodeChild => {
      const ctx = context()
      if (slots.danger) return slots.danger(ctx)
      return h('section', { 'data-security': 'section-danger' }, [
        h('h3', { 'data-security': 'section-title' }, 'Danger zone'),
        h('p', { 'data-security': 'danger-note' }, 'Deletion is confirmed via email — nothing happens until you approve it from the inbox.'),
        h('button', {
          'data-security': 'delete-account',
          'type': 'button',
          'disabled': pending.value === 'delete',
          'onClick': requestDeletion,
        }, pending.value === 'delete' ? '…' : labels.deleteAccount ?? 'Delete account'),
        h('button', {
          'data-security': 'sign-out',
          'type': 'button',
          'disabled': pending.value === 'sign-out',
          'onClick': signOut,
        }, labels.signOut ?? 'Sign out'),
      ])
    }

    const sectionRenderers: Record<SecuritySection, () => VNodeChild> = {
      verification: verificationSection,
      passkeys: passkeysSection,
      sessions: sessionsSection,
      danger: dangerSection,
    }

    return () => h('div', { 'data-security': 'root' }, [
      ...props.sections.map(section => sectionRenderers[section]?.()),
      message.value
        ? h('p', { 'data-security': 'message', 'data-tone': message.value.ok ? 'ok' : 'error', 'role': 'status' }, message.value.text)
        : null,
      slots.footer?.(context()) ?? null,
    ])
  },
})
