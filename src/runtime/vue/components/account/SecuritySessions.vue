<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import type { SecuritySessionsProps } from '../../parts'
import { VNodes } from '../../utils/vnodes'
import { useSecurityView } from './security-settings'

/** `<SecuritySettings>`'s signed-in devices: each with its sign-out, this one marked, and the button that signs out every other. */
defineOptions({ name: 'SecuritySessions' })
const props = defineProps<SecuritySessionsProps>()
const view = useSecurityView('SecuritySessions')
const { t, errorMessage } = view.labels

const list = computed(() => props.sessions.sessions.value ?? [])
// A list that failed to load says why, with the read's own failure; an
// action's failure shows in the message region.
const failed = computed(() => (props.sessions.sessions.value === undefined ? props.sessions.listError.value : null))
</script>

<template>
  <section
    data-security="section-sessions"
    tabindex="-1"
    :aria-busy="sessions.isLoading.value || undefined"
  >
    <h3 data-security="section-title">
      {{ t('sessions') }}
    </h3>
    <p
      v-if="sessions.isLoading.value"
      data-security="sessions-loading"
      role="status"
      aria-live="polite"
    >
      {{ t('sessionsLoading') }}
    </p>
    <p
      v-if="failed"
      data-security="sessions-error"
      role="alert"
    >
      {{ errorMessage(failed) }}
    </p>
    <ul data-security="session-list">
      <template
        v-for="row in list"
        :key="row.id"
      >
        <VNodes
          v-if="view.slots.session"
          :nodes="view.slots.session({ ...view.context.value, entry: row }) as never"
        />
        <li
          v-else
          data-security="session"
          :data-current="row.current || undefined"
        >
          <span data-security="session-name">{{ view.deviceName(row.userAgent) }}</span>
          <span data-security="session-meta">{{ view.date(row.createdAt) }}</span>
          <span
            v-if="row.current"
            data-security="current-badge"
          >{{ t('thisDevice') }}</span>
          <button
            v-else
            data-security="revoke"
            type="button"
            v-bind="busyAttributes(view.busy(`session:${row.id}`))"
            :aria-label="view.busy(`session:${row.id}`) ? undefined : t('revokeNamed', { device: view.deviceName(row.userAgent), date: view.date(row.createdAt) })"
            @click="view.revokeSession(row)"
          >
            {{ view.busy(`session:${row.id}`) ? t('revoking') : t('revoke') }}
          </button>
        </li>
      </template>
    </ul>
    <!-- Unavailable with no other session; busy while they are signed out. -->
    <button
      data-security="revoke-others"
      type="button"
      :disabled="!view.busy('sessions:others') && list.length <= 1"
      v-bind="busyAttributes(view.busy('sessions:others'))"
      @click="view.revokeOthers()"
    >
      {{ view.busy('sessions:others') ? t('revokingOthers') : t('revokeOthers') }}
    </button>
  </section>
</template>
