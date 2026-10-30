<script setup lang="ts">
/**
 * The Access tab's form that invites addresses (a pasted list, no email
 * unless "Email them" is ticked), and what it skipped, with why.
 *
 * Internal: a part of `AdminAccess.vue`.
 *
 * @internal
 */
import type { AccessTab } from './admin-access-tab'

const props = defineProps<{ tab: AccessTab }>()
const { id, t, busy, running, admit, skipped } = props.tab
const { emails, label, email } = props.tab.admitForm
</script>

<template>
  <form
    data-admin="access-admit-form"
    @submit.prevent="admit"
  >
    <label>
      {{ t('access.emails') }}
      <textarea
        v-model="emails"
        required
        rows="4"
        spellcheck="false"
        :aria-describedby="`${id}-admit-hint`"
      />
    </label>
    <label>
      {{ t('access.label') }}
      <input
        v-model="label"
        type="text"
        maxlength="64"
      >
    </label>
    <label data-admin="access-admit-email">
      <input
        v-model="email"
        type="checkbox"
        :aria-describedby="`${id}-admit-email-hint`"
      >
      {{ t('access.emailThem') }}
    </label>
    <p
      :id="`${id}-admit-email-hint`"
      data-admin="hint"
    >
      {{ t('access.emailThemHint') }}
    </p>
    <button
      type="submit"
      data-admin="access-admit-submit"
      :aria-disabled="busy('admit')"
    >
      {{ running === 'admit' ? t('access.admitting') : t('access.admit') }}
    </button>
  </form>
  <ul
    v-if="skipped.length"
    data-admin="access-skipped"
  >
    <li
      v-for="row in skipped"
      :key="row.email"
    >
      {{ t('access.skipped', { email: row.email, reason: t(`access.skipReasons.${row.reason}`) }) }}
    </li>
  </ul>
</template>
