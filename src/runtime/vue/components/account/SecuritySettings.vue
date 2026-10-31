<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { busyAttributes } from '../../a11y'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { type Passkey, usePasskeys } from '../../composables/use-passkeys'
import { useReauthentication } from '../../composables/use-reauthentication'
import { parseUserAgent, type SessionInfo, useSessions } from '../../composables/use-sessions'
import { useAuthSession } from '../../utils/auth-session'
import { useConfirmation } from '../../utils/confirmation'
import { focusedIn, focusStranded, returnFocus } from '../../utils/focus-return'
import { inLocale } from '../../utils/intl'
import { useSettingsMessage } from '../../utils/settings-message'
import ConfirmDialog from '../shell/ConfirmDialog.vue'
import { useSignInAlertsState } from './security-alerts'
import { provideSecurityView, type SecuritySection, type SecuritySettingsSlots, type SecuritySlotContext } from './security-settings'

/**
 * Everything that guards the account: passkey management (add / inline
 * rename / remove), active device sessions (revoke one / revoke others),
 * the latest sign-ins from a new device (each signs its session out while
 * it lasts), and signing this browser out. The account's export and its deletion are
 * `<AccountData>`'s, which the security page renders beside it. Built
 * entirely on `useAuth`, `usePasskeys` and `useSessions`.
 *
 * Markup on `data-security` hooks, built from parts (`SecurityPasskeys`,
 * `SecuritySessions`); replace any region via its slot — each slot receives
 * {@link SecuritySlotContext}. Destructive actions ask first, through the
 * `confirm` prop or, without one, the component's own confirmation dialog.
 *
 * Adding or removing a passkey takes a recent sign-in: when the session's
 * is older, `<ReauthenticateDialog>` (rendered here) asks the person to
 * confirm it is them, then the action runs again. Revoking a session never asks.
 */
defineOptions({ name: 'SecuritySettings' })

const props = withDefaults(defineProps<{
  sections?: SecuritySection[]
  /** Confirm destructive actions; return `false` to abort. Default: the component's own confirmation dialog. */
  confirm?: (message: string) => boolean | Promise<boolean>
  /** Copy for this component, over `appConfig.backend.labels.security` and the translations. */
  labels?: LabelOverrides<BackendLabels['security']>
}>(), { sections: () => ['passkeys', 'sessions', 'alerts', 'danger'], confirm: undefined, labels: undefined })

const emit = defineEmits({
  'passkey-added': () => true,
  'passkey-removed': (_id: string) => true,
  'session-revoked': (_id: string) => true,
  'sessions-revoked': () => true,
  'signed-out': () => true,
  'error': (_message: string) => true,
})
const slots = defineSlots<SecuritySettingsSlots>()

const auth = useAuthSession()
const passkeys = usePasskeys()
const sessions = useSessions()
const alerts = useSignInAlertsState()
// A recent sign-in, asked for when an action needs one and the session's is older.
const { withReauthentication } = useReauthentication()
const labels = useLabels('security', () => props.labels)
const { t, errorMessage, locale } = labels
const date = (value: string | number | Date) => inLocale(locale.value, tag => new Date(value).toLocaleString(tag))
const { note, message } = useSettingsMessage()

/**
 * The actions on their way, by key (`passkey:add`, `session:<id>`, …),
 * oldest first. Each refuses a second press of its own while it runs,
 * however many others started since.
 */
const running = ref<string[]>([])
const busy = (key: string) => running.value.includes(key)
/** Asked before a destructive action: the app's `confirm`, else the component's own dialog. */
const confirmation = useConfirmation(() => props.confirm)
/** The actions waiting on the person's confirmation: a second press does not ask again. */
const confirming = new Set<string>()
const root = ref<HTMLElement | null>(null)
/** Passkey id whose name is being edited inline. */
const editing = ref<string | null>(null)
const editName = ref('')

/** Ask before a destructive action, once: `false` while it runs or the question is already open. */
async function confirmed(key: string, text: string): Promise<boolean> {
  if (busy(key) || confirming.has(key)) return false
  confirming.add(key)
  try {
    return await confirmation.ask(text)
  }
  finally {
    confirming.delete(key)
  }
}

/**
 * After an action, the button pressed may be gone (a revoked session, a
 * removed passkey) or have nothing left to do (no other session to sign
 * out). If it held focus, focus moves to the outcome, or to the next button
 * of its section, or to the section, never to the page.
 */
async function settleFocus(pressed: HTMLElement, section: HTMLElement | null): Promise<void> {
  await nextTick()
  if (!focusStranded(pressed)) return
  const outcome = root.value?.querySelector<HTMLElement>('[data-security="message"]')
  const next = section?.isConnected ? [...section.querySelectorAll<HTMLButtonElement>('button')].find(button => !button.disabled) : undefined
  returnFocus(outcome ?? next ?? (section?.isConnected ? section : null))
}

/**
 * Run one action. A second press of a busy button does nothing: the button
 * stays focusable (`aria-disabled`) rather than `disabled`, which would
 * drop focus to the page.
 */
async function run(key: string, action: () => Promise<unknown>, okText?: () => string) {
  if (busy(key)) return
  // Asked before the action: its outcome may take the button, and its row, away.
  const pressed = focusedIn(root.value)
  const section = pressed?.closest<HTMLElement>('section') ?? null
  note.value = null
  running.value = [...running.value, key]
  try {
    await action()
    if (okText) note.value = { ok: true, text: okText }
  }
  catch (e) {
    // The sentence the composable's `error` holds for the same failure.
    note.value = { ok: false, text: () => errorMessage(e) }
    emit('error', message.value!.text)
  }
  finally {
    running.value = running.value.filter(other => other !== key)
  }
  if (pressed) await settleFocus(pressed, section)
}

const passkeyName = (row: Passkey) => row.name || t('unnamedPasskey')
const signOut = () => run('sign-out', async () => {
  await auth.signOut()
  emit('signed-out')
})

const context = computed<SecuritySlotContext>(() => ({
  user: auth.user.value,
  passkeys,
  sessions,
  alerts,
  message: message.value,
  isPending: running.value.length > 0,
  pendingAction: running.value.at(-1) ?? null,
  signOut,
}))

// Passkey-only: the recovery code a switch answered, shown until the page goes.
const recoveryCode = ref<string | null>(null)

provideSecurityView({
  labels,
  context,
  slots,
  busy,
  date,
  editing,
  editName,
  passkeyName,
  addPasskey: () => run('passkey:add', async () => {
    await withReauthentication(() => passkeys.add())
    emit('passkey-added')
  }, () => t('passkeyAdded')),
  removePasskey: async (row) => {
    const key = `passkey:remove:${row.id}`
    if (!(await confirmed(key, t('removeConfirm', { name: passkeyName(row) })))) return
    await run(key, async () => {
      await withReauthentication(() => passkeys.remove(row.id))
      emit('passkey-removed', row.id)
    })
  },
  recoveryCode,
  setPasskeyOnly: on => run('passkey-only', async () => {
    const answer = await withReauthentication(() => passkeys.setPasskeyOnly(on))
    recoveryCode.value = answer.recoveryCode
  }),
  saveRename: row => run(`passkey:rename:${row.id}`, async () => {
    const name = editName.value.trim()
    if (name && name !== row.name) await passkeys.rename(row.id, name)
    editing.value = null
  }),
  // Renaming swaps the name for a field: focus it, since the person asked for it.
  startRename: (row) => {
    editing.value = row.id
    editName.value = row.name ?? ''
    void nextTick(() => root.value?.querySelector<HTMLElement>('[data-security="input-passkey-name"]')?.focus())
  },
  revokeSession: (row: SessionInfo) => run(`session:${row.id}`, async () => {
    await sessions.revoke(row.id)
    emit('session-revoked', row.id)
  }),
  revokeOthers: () => run('sessions:others', async () => {
    await sessions.revokeOthers()
    emit('sessions-revoked')
  }, () => t('othersRevoked')),
  deviceName: (userAgent) => {
    const { browser, os } = parseUserAgent(userAgent)
    if (os) return t('device', { browser: browser ?? t('browser'), os })
    return browser ?? t('unknownDevice')
  },
})
</script>

<template>
  <div
    ref="root"
    data-security="root"
    :aria-busy="running.length > 0 ? 'true' : undefined"
  >
    <template
      v-for="section in sections"
      :key="section"
    >
      <slot
        v-if="section === 'passkeys'"
        name="passkeys"
        v-bind="context"
      >
        <SecurityPasskeys :passkeys="passkeys" />
      </slot>
      <slot
        v-else-if="section === 'sessions'"
        name="sessions"
        v-bind="context"
      >
        <SecuritySessions :sessions="sessions" />
      </slot>
      <slot
        v-else-if="section === 'alerts'"
        name="alerts"
        v-bind="context"
      >
        <SecurityAlerts :alerts="alerts" />
      </slot>
      <slot
        v-else-if="section === 'danger'"
        name="danger"
        v-bind="context"
      >
        <section
          data-security="section-danger"
          tabindex="-1"
        >
          <h3 data-security="section-title">
            {{ t('danger') }}
          </h3>
          <button
            data-security="sign-out"
            type="button"
            v-bind="busyAttributes(busy('sign-out'))"
            @click="signOut"
          >
            {{ busy('sign-out') ? t('signingOut') : t('signOut') }}
          </button>
        </section>
      </slot>
    </template>
    <!-- A failure interrupts (`alert` is implicitly assertive); a confirmation waits its turn as a polite status. Focus rests here when the button pressed went with the action. -->
    <p
      v-if="message"
      data-security="message"
      tabindex="-1"
      :data-tone="message.ok ? 'ok' : 'error'"
      :role="message.ok ? 'status' : 'alert'"
      :aria-live="message.ok ? 'polite' : undefined"
    >
      {{ message.text }}
    </p>
    <slot
      name="footer"
      v-bind="context"
    />
    <ReauthenticateDialog />
    <ConfirmDialog
      :confirmation="confirmation"
      :accept-label="t('confirmAccept')"
      :cancel-label="t('confirmCancel')"
    />
  </div>
</template>
