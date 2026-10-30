<script setup lang="ts">
/**
 * The Access tab's form that makes an invite code or an access link, and
 * the one it made, shown once with a copy button.
 *
 * Internal: a part of `AdminAccess.vue`.
 *
 * @internal
 */
import type { AccessTab } from './admin-access-tab'

const props = defineProps<{ tab: AccessTab }>()
const { id, t, busy, running, create, copy, shown, copied } = props.tab
const { kind, label, maxUses, expires } = props.tab.form
</script>

<template>
  <form
    data-admin="access-create"
    @submit.prevent="create"
  >
    <label>
      {{ t('access.kind') }}
      <select v-model="kind">
        <option value="code">{{ t('access.kinds.code') }}</option>
        <option value="link">{{ t('access.kinds.link') }}</option>
      </select>
    </label>
    <label>
      {{ t('access.label') }}
      <input
        v-model="label"
        type="text"
        required
        maxlength="64"
        :aria-describedby="`${id}-label-hint`"
      >
    </label>
    <p
      :id="`${id}-label-hint`"
      data-admin="hint"
    >
      {{ t('access.labelHint') }}
    </p>
    <label>
      {{ t('access.maxUses') }}
      <input
        v-model="maxUses"
        type="number"
        min="1"
        required
        inputmode="numeric"
      >
    </label>
    <label>
      {{ t('access.expiresAt') }}
      <input
        v-model="expires"
        type="date"
        :required="kind === 'link'"
      >
    </label>
    <button
      type="submit"
      data-admin="access-create-submit"
      :aria-disabled="busy('create')"
    >
      {{ running === 'create' ? t('access.creating') : t('access.create') }}
    </button>
  </form>
  <div
    v-if="shown"
    data-admin="access-shown"
    role="status"
  >
    <p>{{ t('access.created') }}</p>
    <code data-admin="access-secret">{{ shown.text }}</code>
    <button
      type="button"
      data-admin="access-copy"
      @click="copy"
    >
      {{ copied ? t('access.copied') : t('access.copy') }}
    </button>
  </div>
</template>
