<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import { formatBillingDate } from '../../composables/billing-format'
import type { AccountExportProps } from '../../parts'
import { useAccountDataView } from './account-data'

/** `<AccountData>`'s export: what it holds, the newest download link and when it expires, the account's files as zip parts behind links that end with it, and the button that makes one. */
defineOptions({ name: 'AccountExport' })
defineProps<AccountExportProps>()
const view = useAccountDataView('AccountExport')
const { t, locale } = view.labels
const { link } = view
const titleId = `${view.id}-export`
</script>

<template>
  <section
    data-account="section-export"
    :aria-labelledby="titleId"
  >
    <h3
      :id="titleId"
      data-account="section-title"
    >
      {{ t('exportTitle') }}
    </h3>
    <p data-account="note">
      {{ t('exportNote') }}
    </p>
    <p
      v-if="view.context.value.latestExport"
      data-account="export-ready"
    >
      <a
        ref="link"
        data-account="export-link"
        :href="view.context.value.latestExport.url"
        download="account-data.json"
        rel="noopener"
      >{{ t('download') }}</a>
      {{ ' ' }}
      <span data-account="export-expiry">{{ t('expires', { time: formatBillingDate(view.context.value.latestExport.expiresAt, { timeStyle: 'short' }, locale) }) }}</span>
    </p>
    <!-- The account's files as zip parts, behind links that end with the export's. -->
    <p
      v-for="(part, index) in view.context.value.latestExport?.parts ?? []"
      :key="part.url"
      data-account="export-part"
    >
      <a
        data-account="export-part-link"
        :href="part.url"
        :download="`account-files-${index + 1}.zip`"
        rel="noopener"
      >{{ t('filesPart', { part: index + 1, count: view.context.value.latestExport?.parts.length ?? 0 }) }}</a>
    </p>
    <button
      data-account="export"
      type="button"
      v-bind="busyAttributes(view.context.value.pendingAction === 'export')"
      @click="view.context.value.exportData()"
    >
      {{ view.context.value.pendingAction === 'export' ? t('exporting') : t('export') }}
    </button>
  </section>
</template>
