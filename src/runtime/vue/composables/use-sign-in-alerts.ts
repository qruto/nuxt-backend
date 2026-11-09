import { computed, type ComputedRef, type MaybeRefOrGetter, ref, toValue } from 'vue'
import { busyAttributes } from '../a11y'
import { alertDevice, type SignInAlert, type SignInAlertsApi, useSignInAlertsState } from '../components/account/security-alerts'
import { type BackendError, failureOf } from '../utils/backend-error'
import { inLocale } from '../utils/intl'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn } from './use-labels'
import { type SessionInfo, type SessionsApi, useSessions } from './use-sessions'

export type { SignInAlert } from '../components/account/security-alerts'

export interface UseSignInAlertsOptions {
  /** Override the injected `api.auth` namespace: `listSignInAlerts`, and the session functions a sign-out uses. */
  api?: SignInAlertsApi & SessionsApi
  /** Copy for the alerts, over app config and the translations: the `security` group's alert keys. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'security'> | undefined>
}

export interface UseSignInAlertsReturn {
  /** The account's latest sign-ins from a device it had not used before, and with its recovery code, newest first and live. `[]` signed out, `undefined` until the first read lands. */
  alerts: ComputedRef<SignInAlert[] | undefined>
  /** `true` until the first read lands. */
  isLoading: ComputedRef<boolean>
  /** `true` while `signOut` runs. */
  isPending: ComputedRef<boolean>
  /** Why the last sign-out failed, else why the alerts could not be read, else `null`. A sign-out clears its own failure when the next one starts. */
  error: ComputedRef<BackendError | null>
  /** The device an alert names, in words: `Firefox · macOS`, `Browser · iOS`, or "Unknown device". */
  device: (alert: SignInAlert) => string
  /** When it signed in, in the person's language. */
  date: (alert: SignInAlert) => string
  /** The alert as one sentence: "New sign-in from Firefox · macOS, 3/11/2026, 09:12", or the recovery code's. */
  sentence: (alert: SignInAlert) => string
  /** The session the alert opened, while it is still signed in; `undefined` once it ended. Its `current` says it is this browser's. */
  sessionOf: (alert: SignInAlert) => SessionInfo | undefined
  /** Whether a sign-out applies: the session is still signed in, and it is not this browser's. */
  canSignOut: (alert: SignInAlert) => boolean
  /** Sign the alert's session out. The list of sessions updates on its own. Rejects with the failure, which `error` also holds. */
  signOut: (alert: SignInAlert) => Promise<void>
  /** What the status says: "No new device has signed in to your account." once the list is empty; empty otherwise. */
  status: ComputedRef<string>
  /** The alerts' words, for markup of your own: the `security` group (`alertSignOut`, `thisDevice`, …). */
  labels: UseLabelsReturn<'security'>
  /**
   * Attribute bindings, with the accessibility attributes, for markup of
   * your own. `root`, `status` and `error` are computed refs: spread their
   * `.value` (`v-bind="alerts.bind.root.value"`). `alert` and `signOut` are
   * functions of one alert that return its attributes as a plain object
   * (`v-bind="alerts.bind.signOut(alert)"`).
   */
  bind: {
    /** The list: `data-alerts="root"`, busy while the alerts load or a sign-out runs. */
    root: ComputedRef<Record<string, unknown>>
    /** One alert's row: `data-state` says a new device or the recovery code. */
    alert: (alert: SignInAlert) => Record<string, unknown>
    /** One alert's sign-out button: its click, `aria-disabled` while it signs out, named after the device and the time. */
    signOut: (alert: SignInAlert) => Record<string, unknown>
    /** A polite live region, always in the page: put `status` in it. */
    status: ComputedRef<Record<string, unknown>>
    /** An alert for `error`: render it while `error` is set, with `labels.errorMessage(error)` in it. */
    error: ComputedRef<Record<string, unknown>>
  }
}

/** An alert's key: the time and the session it opened. */
const keyOf = (alert: SignInAlert) => `${alert.at}:${alert.sessionId ?? ''}`

/**
 * What an account shows around its sign-ins, without the markup: the
 * latest sign-ins from a device it had not used before, and with its
 * recovery code (the ones the person is also emailed about), each with its
 * device and time, and a button that signs that session out while it is
 * still signed in and is not this browser's. `<SecuritySettings>`' Alerts
 * section is this with the package's markup. Needs `listSignInAlerts` and
 * the session functions re-exported from `backend/auth.ts`, as the
 * scaffold does.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const signIns = useSignInAlerts()
 * const { t } = signIns.labels
 * </script>
 * <template>
 *   <ul v-bind="signIns.bind.root.value">
 *     <li v-for="alert in signIns.alerts.value" :key="`${alert.at}:${alert.sessionId ?? ''}`" v-bind="signIns.bind.alert(alert)">
 *       {{ signIns.sentence(alert) }}
 *       <button v-if="signIns.canSignOut(alert)" v-bind="signIns.bind.signOut(alert)">{{ t('alertSignOut') }}</button>
 *     </li>
 *   </ul>
 *   <p v-bind="signIns.bind.status.value">{{ signIns.status.value }}</p>
 * </template>
 * ```
 */
export function useSignInAlerts(options: UseSignInAlertsOptions = {}): UseSignInAlertsReturn {
  const labels = useLabels('security', () => toValue(options.labels))
  const read = useSignInAlertsState(options.api)
  const sessions = useSessions(options.api ? { api: options.api } : {})
  const signingOut = ref<string | null>(null)
  const failure = ref<BackendError | null>(null)

  const device = (alert: SignInAlert) => alertDevice(alert, labels.t)
  const date = (alert: SignInAlert) => inLocale(labels.locale.value, tag => new Date(alert.at).toLocaleString(tag))
  const sentence = (alert: SignInAlert) => labels.t(alert.recovery ? 'alertRecovery' : 'alertNewDevice', { device: device(alert), date: date(alert) })
  const sessionOf = (alert: SignInAlert) => (alert.sessionId ? sessions.sessions.value?.find(row => row.id === alert.sessionId) : undefined)
  const canSignOut = (alert: SignInAlert) => sessionOf(alert)?.current === false

  async function signOut(alert: SignInAlert): Promise<void> {
    const session = sessionOf(alert)
    if (!session || session.current || signingOut.value) return
    failure.value = null
    signingOut.value = keyOf(alert)
    try {
      await sessions.revoke(session.id)
    }
    catch (cause) {
      failure.value = failureOf(cause)
      throw cause
    }
    finally {
      signingOut.value = null
    }
  }

  const isPending = computed(() => signingOut.value !== null)
  const error = computed(() => failure.value ?? read.error.value)
  const status = computed(() => (!read.error.value && read.alerts.value?.length === 0 ? labels.t('alertsEmpty') : ''))

  return {
    alerts: read.alerts,
    isLoading: read.isLoading,
    isPending,
    error,
    device,
    date,
    sentence,
    sessionOf,
    canSignOut,
    signOut,
    status,
    labels,
    bind: {
      root: computed(() => ({ 'data-alerts': 'root', 'aria-busy': read.isLoading.value || isPending.value ? 'true' : undefined })),
      alert: alert => ({ 'data-alerts': 'alert', 'data-state': alert.recovery ? 'recovery' : 'new-device' }),
      signOut: (alert) => {
        const pending = signingOut.value === keyOf(alert)
        return {
          'type': 'button',
          'data-alerts': 'sign-out',
          ...busyAttributes(pending),
          'aria-label': pending ? undefined : labels.t('alertSignOutNamed', { device: device(alert), date: date(alert) }),
          'onClick': () => {
            if (!signingOut.value) signOut(alert).catch(() => {})
          },
        }
      },
      status: computed(() => ({ 'role': 'status', 'aria-live': 'polite', 'data-alerts': 'status' })),
      error: computed(() => ({ 'role': 'alert', 'data-alerts': 'error' })),
    },
  }
}
