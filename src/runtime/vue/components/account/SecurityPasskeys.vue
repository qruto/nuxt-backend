<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import { valueLabel } from '../../composables/use-labels'
import type { Passkey } from '../../composables/use-passkeys'
import type { SecurityPasskeysProps } from '../../parts'
import { VNodes } from '../../utils/vnodes'
import { useSecurityView } from './security-settings'

/**
 * `<SecuritySettings>`'s passkeys: the list, with rename and remove on each,
 * the button that adds one, and passkey-only: the switch (once the account
 * has a passkey), a new recovery code while it is on, and the code a switch
 * answered, shown once.
 */
defineOptions({ name: 'SecurityPasskeys' })
defineProps<SecurityPasskeysProps>()
const view = useSecurityView('SecurityPasskeys')
const { t } = view.labels
const { editName } = view

const meta = (row: Passkey) => [row.deviceType ? valueLabel(view.labels, 'security', 'deviceTypes', row.deviceType) : null, view.date(row.createdAt)].filter(Boolean).join(' · ')
function keydown(event: KeyboardEvent, row: Passkey) {
  if (event.key === 'Enter') {
    event.preventDefault()
    void view.saveRename(row)
  }
  if (event.key === 'Escape') view.editing.value = null
}
</script>

<template>
  <section
    data-security="section-passkeys"
    tabindex="-1"
  >
    <h3 data-security="section-title">
      {{ t('passkeys') }}
    </h3>
    <p
      v-if="passkeys.passkeys.value && passkeys.passkeys.value.length === 0"
      data-security="passkeys-empty"
    >
      {{ t('passkeysEmpty') }}
    </p>
    <ul
      v-else
      data-security="passkey-list"
    >
      <template
        v-for="row in passkeys.passkeys.value ?? []"
        :key="row.id"
      >
        <VNodes
          v-if="view.slots.passkey"
          :nodes="view.slots.passkey({ ...view.context.value, entry: row }) as never"
        />
        <!-- Each button's accessible name says which passkey it acts on: a list of identical "Remove" buttons is no help read out of context. -->
        <li
          v-else
          data-security="passkey"
          :data-editing="view.editing.value === row.id || undefined"
        >
          <!-- The field replaces the name it edits, so there is no room for a visible label in the row: it is named for assistive tech. -->
          <input
            v-if="view.editing.value === row.id"
            v-model="editName"
            data-security="input-passkey-name"
            type="text"
            :aria-label="t('passkeyName')"
            @keydown="keydown($event, row)"
          >
          <span
            v-else
            data-security="passkey-name"
          >{{ view.passkeyName(row) }}</span>
          <span data-security="passkey-meta">{{ meta(row) }}</span>
          <button
            v-if="view.editing.value === row.id"
            data-security="rename"
            type="button"
            v-bind="busyAttributes(view.busy(`passkey:rename:${row.id}`))"
            :aria-label="view.busy(`passkey:rename:${row.id}`) ? undefined : t('saveNamed', { name: view.passkeyName(row) })"
            @click="view.saveRename(row)"
          >
            {{ view.busy(`passkey:rename:${row.id}`) ? t('saving') : t('save') }}
          </button>
          <button
            v-else
            data-security="rename"
            type="button"
            :aria-label="t('renameNamed', { name: view.passkeyName(row) })"
            @click="view.startRename(row)"
          >
            {{ t('rename') }}
          </button>
          <button
            data-security="remove"
            type="button"
            v-bind="busyAttributes(view.busy(`passkey:remove:${row.id}`))"
            :aria-label="view.busy(`passkey:remove:${row.id}`) ? undefined : t('removeNamed', { name: view.passkeyName(row) })"
            @click="view.removePasskey(row)"
          >
            {{ view.busy(`passkey:remove:${row.id}`) ? t('removing') : t('remove') }}
          </button>
        </li>
      </template>
    </ul>
    <button
      data-security="add-passkey"
      type="button"
      v-bind="busyAttributes(view.busy('passkey:add'))"
      @click="view.addPasskey()"
    >
      {{ view.busy('passkey:add') ? t('addingPasskey') : t('addPasskey') }}
    </button>
    <div
      v-if="passkeys.passkeyOnly.value || passkeys.passkeys.value?.length"
      data-security="passkey-only"
      :data-state="passkeys.passkeyOnly.value ? 'on' : 'off'"
    >
      <p data-security="passkey-only-hint">
        {{ t('passkeyOnlyHint') }}
      </p>
      <button
        v-if="passkeys.passkeyOnly.value"
        data-security="passkey-only-off"
        type="button"
        v-bind="busyAttributes(view.busy('passkey-only'))"
        @click="view.setPasskeyOnly(false)"
      >
        {{ t('passkeyOnlyOff') }}
      </button>
      <button
        v-else
        data-security="passkey-only-on"
        type="button"
        v-bind="busyAttributes(view.busy('passkey-only'))"
        @click="view.setPasskeyOnly(true)"
      >
        {{ t('passkeyOnly') }}
      </button>
      <button
        v-if="passkeys.passkeyOnly.value"
        data-security="recovery-code-new"
        type="button"
        v-bind="busyAttributes(view.busy('passkey-only'))"
        @click="view.setPasskeyOnly(true)"
      >
        {{ t('newRecoveryCodeAction') }}
      </button>
      <p
        v-if="view.recoveryCode.value"
        data-security="recovery-code"
        role="status"
      >
        {{ t('recoveryCode', { code: view.recoveryCode.value }) }}
      </p>
    </div>
  </section>
</template>
