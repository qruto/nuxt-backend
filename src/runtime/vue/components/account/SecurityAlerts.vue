<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import type { SecurityAlertsProps } from '../../parts'
import type { SignInAlert } from './security-alerts'
import { useSecurityView } from './security-settings'

/**
 * `<SecuritySettings>`'s Alerts section: the account's latest sign-ins from
 * a device it had not used before, and with its recovery code, each with
 * its device and time. While the session an alert opened is still signed
 * in, its row signs it out in one click; this browser's own is marked.
 */
defineOptions({ name: 'SecurityAlerts' })
const props = defineProps<SecurityAlertsProps>()
const view = useSecurityView('SecurityAlerts')
const { t, errorMessage } = view.labels

const list = computed(() => props.alerts.alerts.value ?? [])
const sessions = computed(() => view.context.value.sessions.sessions.value ?? [])
/** The session an alert opened, while it is still signed in. */
const sessionOf = (alert: SignInAlert) => (alert.sessionId ? sessions.value.find(row => row.id === alert.sessionId) : undefined)
const device = (alert: SignInAlert) => (alert.os ? t('device', { browser: alert.browser ?? t('browser'), os: alert.os }) : alert.browser ?? t('unknownDevice'))
const sentence = (alert: SignInAlert) => t(alert.recovery ? 'alertRecovery' : 'alertNewDevice', { device: device(alert), date: view.date(alert.at) })
</script>

<template>
  <section
    data-security="section-alerts"
    tabindex="-1"
    :aria-busy="alerts.isLoading.value || undefined"
  >
    <h3 data-security="section-title">
      {{ t('alerts') }}
    </h3>
    <p
      v-if="alerts.error.value"
      data-security="alerts-error"
      role="alert"
    >
      {{ errorMessage(alerts.error.value) }}
    </p>
    <p
      v-else-if="alerts.alerts.value && !list.length"
      data-security="alerts-empty"
    >
      {{ t('alertsEmpty') }}
    </p>
    <ul
      v-if="list.length"
      data-security="alert-list"
    >
      <li
        v-for="alert in list"
        :key="`${alert.at}:${alert.sessionId ?? ''}`"
        data-security="alert"
        :data-state="alert.recovery ? 'recovery' : 'new-device'"
      >
        <span data-security="alert-text">{{ sentence(alert) }}</span>
        <template v-if="sessionOf(alert)">
          <span
            v-if="sessionOf(alert)!.current"
            data-security="current-badge"
          >{{ t('thisDevice') }}</span>
          <button
            v-else
            data-security="alert-revoke"
            type="button"
            v-bind="busyAttributes(view.busy(`session:${alert.sessionId}`))"
            :aria-label="view.busy(`session:${alert.sessionId}`) ? undefined : t('alertSignOutNamed', { device: device(alert), date: view.date(alert.at) })"
            @click="view.revokeSession(sessionOf(alert)!)"
          >
            {{ view.busy(`session:${alert.sessionId}`) ? t('revoking') : t('alertSignOut') }}
          </button>
        </template>
      </li>
    </ul>
  </section>
</template>
