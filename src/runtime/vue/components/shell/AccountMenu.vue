<script setup lang="ts">
import { usePopoverDisclosure } from '../../composables/use-app-shell'
import type { AccountMenuProps } from '../../parts'

/**
 * `<AppShell>`'s account menu: a button with the person's picture (or
 * initial) and name, and the disclosure it opens, on the browser's native
 * popover: the profile, security and settings links, the admin console for an
 * administrator, and signing out. Escape closes it and focus returns to the
 * button.
 */
defineOptions({ name: 'AccountMenu' })
const props = defineProps<AccountMenuProps>()
const { t } = props.shell.labels
const account = props.shell.account
const menu = usePopoverDisclosure()
</script>

<template>
  <div
    data-shell="account"
    :data-state="account.isSigningOut.value ? 'pending' : menu.open.value ? 'open' : 'closed'"
  >
    <button
      v-bind="menu.trigger.value"
      data-shell="account-button"
      :aria-label="t('account.menu', { name: account.name.value })"
    >
      <span
        data-shell="avatar"
        aria-hidden="true"
      >
        <img
          v-if="account.image.value"
          data-shell="avatar-image"
          :src="account.image.value"
          alt=""
          width="28"
          height="28"
          loading="lazy"
          referrerpolicy="no-referrer"
        >
        <template v-else>{{ account.initials.value }}</template>
      </span>
      <span data-shell="account-name">{{ account.name.value }}</span>
    </button>
    <div v-bind="menu.panel({ 'data-shell': 'account-panel' })">
      <p
        v-if="account.email.value"
        data-shell="signed-in-as"
      >
        {{ t('account.signedInAs', { email: account.email.value }) }}
      </p>
      <nav
        data-shell="account-links"
        :aria-label="t('account.heading')"
      >
        <NuxtLink
          v-for="link in account.links.value"
          :key="link.key"
          :to="link.to"
          data-shell="link"
          :data-link="link.key"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>
      <button
        type="button"
        data-shell="sign-out"
        :aria-disabled="account.isSigningOut.value ? 'true' : undefined"
        @click="account.signOut()"
      >
        {{ account.isSigningOut.value ? t('account.signingOut') : t('account.signOut') }}
      </button>
    </div>
    <p
      role="status"
      aria-live="polite"
      data-shell="status"
    >
      {{ account.announcement.value }}
    </p>
    <p
      v-if="account.signOutError.value"
      role="alert"
      data-shell="error"
    >
      {{ account.signOutError.value }}
    </p>
  </div>
</template>
