<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import { formatBillingDate } from '../../composables/billing-format'
import type { AdminSession } from '../../composables/use-admin'
import { valueLabel } from '../../composables/use-labels'
import { parseUserAgent } from '../../composables/use-sessions'
import type { AdminUserDrawerProps } from '../../parts'
import AdminDrawerFrame from './AdminDrawerFrame.vue'
import { BAN_DURATIONS, methodKey, useAdminUsersView } from './admin'

/**
 * One account in full, in a native modal dialog named by the account: its
 * details, its role, its ban, passkey-only, its device sessions and workspaces, and
 * "Impersonate". It takes focus on its close button, keeps it inside, and
 * closes on Escape or "Close".
 */
defineOptions({ name: 'AdminUserDrawer' })
const props = defineProps<AdminUserDrawerProps>()
const view = useAdminUsersView('AdminUserDrawer')
const { labels } = view
const { t, locale } = labels
const { role, banReason, banFor } = view

const detail = computed(() => props.admin.user.value)
const nameOf = (user: { name?: string | null, email: string }) => user.name || user.email
const dateTime = (value: number) => formatBillingDate(value, { dateStyle: 'medium', timeStyle: 'short' }, locale.value)
const busy = (key: string) => busyAttributes(view.running.value === key)
const running = (key: string) => view.running.value === key
const own = computed(() => view.own(props.user))
// The account's own role is offered too, as its details read it once loaded.
const choices = computed(() => [...new Set([...view.roles(), (detail.value?.user ?? props.user).role])])
const durations = Object.keys(BAN_DURATIONS) as Array<keyof typeof BAN_DURATIONS>
const openSessions = computed(() => {
  const now = Date.now()
  return (detail.value?.sessions ?? []).filter(session => session.expiresAt > now)
})

const deviceName = (userAgent: string | null): string => {
  const { browser, os } = parseUserAgent(userAgent)
  if (os) return t('user.device', { browser: browser ?? t('user.browser'), os })
  return browser ?? t('user.unknownDevice')
}
const sessionText = (session: AdminSession) => [
  t('user.session', { device: deviceName(session.userAgent), date: dateTime(session.createdAt) }),
  t('user.until', { date: dateTime(session.expiresAt) }),
  ...(session.impersonated ? [t('user.visit')] : []),
].join(' · ')
// A ticket's kind (`invite-code`) as its label key (`inviteCode`), with the cohort's label.
const ticketWord = (ticket: { kind: string, label?: string }) => {
  const kind = valueLabel(labels, 'admin', 'tickets', ticket.kind.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase()))
  return ticket.label ? t('user.ticketLabel', { ticket: kind, label: ticket.label }) : kind
}
const banNote = computed(() => {
  const user = detail.value?.user ?? props.user
  return user.banExpires
    ? t('user.bannedUntilNote', { date: dateTime(user.banExpires), reason: user.banReason ?? t('user.noReason') })
    : t('user.bannedNote', { reason: user.banReason ?? t('user.noReason') })
})

// In the template: Escape is the browser's own close of a modal dialog: close
// it here, and give focus back.
</script>

<template>
  <AdminDrawerFrame
    :view="view as never"
    :detail="detail"
    :title="detail ? nameOf(detail.user) : t('users.account')"
    :subtitle="detail && detail.user.name ? detail.user.email : null"
    :not-found="t('user.notFound')"
  >
    <template v-if="detail">
      <dl data-admin="details">
        <dt data-admin="detail-term">
          {{ t('users.role') }}
        </dt>
        <dd data-admin="detail-value">
          {{ view.roleWord(detail.user.role) }}
        </dd>
        <dt data-admin="detail-term">
          {{ t('users.status') }}
        </dt>
        <dd data-admin="detail-value">
          {{ view.status(detail.user) }}
        </dd>
        <dt data-admin="detail-term">
          {{ t('created') }}
        </dt>
        <dd data-admin="detail-value">
          {{ view.date(detail.user.createdAt) }}
        </dd>
        <dt data-admin="detail-term">
          {{ t('user.lastSignIn') }}
        </dt>
        <dd data-admin="detail-value">
          {{ detail.user.lastSignInMethod ? valueLabel(labels, 'admin', 'methods', methodKey(detail.user.lastSignInMethod)) : t('user.never') }}
        </dd>
        <!-- The ticket that admitted the account while the app was closed. -->
        <template v-if="detail.ticket">
          <dt data-admin="detail-term">
            {{ t('user.ticket') }}
          </dt>
          <dd data-admin="detail-value">
            {{ ticketWord(detail.ticket) }}
          </dd>
        </template>
      </dl>
      <p
        v-if="own"
        data-admin="self-note"
      >
        {{ t('user.self') }}
      </p>
      <template v-else>
        <section data-admin="section-role">
          <h3 data-admin="section-title">
            {{ t('user.role') }}
          </h3>
          <form
            data-admin="role-form"
            @submit.prevent="view.saveRole(detail.user)"
          >
            <label data-admin="label">
              {{ t('user.role') }}
              <select
                v-model="role"
                data-admin="select-role"
              >
                <option
                  v-for="choice in choices"
                  :key="choice"
                  data-admin="option"
                  :value="choice"
                >
                  {{ view.roleWord(choice) }}
                </option>
              </select>
            </label>
            <button
              data-admin="save-role"
              type="submit"
              v-bind="busy('role')"
            >
              {{ running('role') ? t('user.savingRole') : t('user.saveRole') }}
            </button>
          </form>
        </section>
        <section data-admin="section-ban">
          <h3 data-admin="section-title">
            {{ t('user.ban') }}
          </h3>
          <template v-if="detail.user.banned">
            <p data-admin="ban-note">
              {{ banNote }}
            </p>
            <button
              data-admin="unban"
              type="button"
              v-bind="busy('unban')"
              @click="view.unban(detail.user)"
            >
              {{ running('unban') ? t('user.unbanning') : t('user.unban') }}
            </button>
          </template>
          <form
            v-else
            data-admin="ban-form"
            @submit.prevent="view.ban(detail.user)"
          >
            <label data-admin="label">
              {{ t('user.banReason') }}
              <input
                v-model="banReason"
                data-admin="input-ban-reason"
                type="text"
                maxlength="200"
              >
            </label>
            <label data-admin="label">
              {{ t('user.banFor') }}
              <select
                v-model="banFor"
                data-admin="select-ban-duration"
              >
                <option
                  v-for="key in durations"
                  :key="key"
                  data-admin="option"
                  :value="key"
                >
                  {{ t(`user.durations.${key}`) }}
                </option>
              </select>
            </label>
            <button
              data-admin="ban"
              type="submit"
              v-bind="busy('ban')"
            >
              {{ running('ban') ? t('user.banning') : t('user.ban') }}
            </button>
          </form>
        </section>
        <section
          v-if="detail.user.passkeyOnly"
          data-admin="section-passkey-only"
        >
          <p data-admin="passkey-only-note">
            {{ t('user.passkeyOnly') }}
          </p>
          <button
            data-admin="passkey-only-off"
            type="button"
            v-bind="busy('passkey-only')"
            @click="view.allowSignInCodes(detail.user)"
          >
            {{ running('passkey-only') ? t('user.passkeyOnlyTurningOff') : t('user.passkeyOnlyOff') }}
          </button>
        </section>
      </template>
      <section data-admin="section-sessions">
        <h3 data-admin="section-title">
          {{ t('user.sessions') }}
        </h3>
        <p
          v-if="openSessions.length === 0"
          data-admin="sessions-empty"
        >
          {{ t('user.noSessions') }}
        </p>
        <template v-else>
          <ul data-admin="session-list">
            <li
              v-for="session in openSessions"
              :key="session.id"
              data-admin="session"
              :data-visit="session.impersonated || undefined"
            >
              {{ sessionText(session) }}
            </li>
          </ul>
          <button
            data-admin="revoke-sessions"
            type="button"
            v-bind="busy('sessions')"
            @click="view.revokeSessions(detail.user)"
          >
            {{ running('sessions') ? t('user.signingOut') : t('user.signOutAll') }}
          </button>
        </template>
      </section>
      <section data-admin="section-workspaces">
        <h3 data-admin="section-title">
          {{ t('user.workspaces') }}
        </h3>
        <p
          v-if="detail.workspaces.length === 0"
          data-admin="workspaces-empty"
        >
          {{ t('user.noWorkspaces') }}
        </p>
        <ul
          v-else
          data-admin="membership-list"
        >
          <li
            v-for="membership in detail.workspaces"
            :key="membership.workspaceId"
            data-admin="membership"
          >
            {{ t('user.membership', { workspace: membership.name, role: valueLabel(labels, 'admin', 'workspaceRoles', membership.role) }) }}
          </li>
        </ul>
      </section>
      <p
        v-if="detail.truncated"
        data-admin="truncated"
      >
        {{ t('truncated', { count: 100 }) }}
      </p>
      <section
        v-if="!own"
        data-admin="section-impersonate"
      >
        <p
          v-if="detail.user.administrator"
          data-admin="impersonate-note"
        >
          {{ t('user.administrator') }}
        </p>
        <template v-else>
          <p data-admin="impersonate-note">
            {{ t('user.impersonateNote') }}
          </p>
          <button
            data-admin="impersonate"
            type="button"
            v-bind="busy('impersonate')"
            :aria-label="running('impersonate') ? undefined : t('user.impersonateNamed', { name: nameOf(detail.user) })"
            @click="view.impersonate(detail.user)"
          >
            {{ running('impersonate') ? t('user.impersonating') : t('user.impersonate') }}
          </button>
        </template>
      </section>
    </template>
  </AdminDrawerFrame>
</template>
