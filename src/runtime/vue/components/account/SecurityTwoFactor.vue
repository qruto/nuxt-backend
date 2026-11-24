<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { SecurityTwoFactorProps } from '../../parts'
import { useSecurityView } from './security-settings'

/**
 * `<SecuritySettings>`'s authenticator app: the button that sets one up,
 * then the link and the key to add the account to the app with the field
 * for its first code, the backup codes a setup or a regeneration answered
 * (shown once), and turning it off.
 */
defineOptions({ name: 'SecurityTwoFactor' })
defineProps<SecurityTwoFactorProps>()
const view = useSecurityView('SecurityTwoFactor')
const { t } = view.labels
const { twoFactorCode } = view
</script>

<template>
  <section
    data-security="section-two-factor"
    tabindex="-1"
    :data-state="twoFactor.enabled.value ? 'on' : 'off'"
  >
    <h3 data-security="section-title">
      {{ t('twoFactor') }}
    </h3>
    <p data-security="two-factor-hint">
      {{ twoFactor.enabled.value ? t('twoFactorOn') : t('twoFactorHint') }}
    </p>
    <template v-if="!twoFactor.enabled.value">
      <form
        v-if="twoFactor.pendingSetup.value"
        data-security="two-factor-setup"
        @submit.prevent="view.confirmTwoFactor()"
      >
        <p data-security="two-factor-scan">
          {{ t('twoFactorScan') }}
        </p>
        <a
          data-security="two-factor-link"
          :href="twoFactor.pendingSetup.value.totpURI"
        >{{ t('twoFactorOpenApp') }}</a>
        <code data-security="two-factor-key">{{ t('twoFactorKey', { secret: twoFactor.pendingSetup.value.secret }) }}</code>
        <label data-security="label-two-factor-code">
          {{ t('twoFactorCode') }}
          <input
            v-model="twoFactorCode"
            data-security="input-two-factor-code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9 ]*"
            maxlength="7"
            required
          >
        </label>
        <button
          data-security="two-factor-confirm"
          type="submit"
          v-bind="busyAttributes(view.busy('two-factor:confirm'))"
        >
          {{ view.busy('two-factor:confirm') ? t('twoFactorConfirming') : t('twoFactorConfirm') }}
        </button>
      </form>
      <button
        v-else
        data-security="two-factor-start"
        type="button"
        v-bind="busyAttributes(view.busy('two-factor:start'))"
        @click="view.startTwoFactor()"
      >
        {{ view.busy('two-factor:start') ? t('twoFactorStarting') : t('twoFactorStart') }}
      </button>
    </template>
    <template v-else>
      <button
        data-security="backup-codes-new"
        type="button"
        v-bind="busyAttributes(view.busy('two-factor:backup-codes'))"
        @click="view.regenerateBackupCodes()"
      >
        {{ view.busy('two-factor:backup-codes') ? t('backupCodesMaking') : t('backupCodesNew') }}
      </button>
      <button
        data-security="two-factor-disable"
        type="button"
        v-bind="busyAttributes(view.busy('two-factor:disable'))"
        @click="view.disableTwoFactor()"
      >
        {{ view.busy('two-factor:disable') ? t('twoFactorDisabling') : t('twoFactorDisable') }}
      </button>
    </template>
    <div
      v-if="view.backupCodes.value"
      data-security="backup-codes"
      role="status"
    >
      <p data-security="backup-codes-note">
        {{ t('backupCodes') }}
      </p>
      <ul data-security="backup-code-list">
        <li
          v-for="code in view.backupCodes.value"
          :key="code"
          data-security="backup-code"
        >
          <code>{{ code }}</code>
        </li>
      </ul>
    </div>
  </section>
</template>
