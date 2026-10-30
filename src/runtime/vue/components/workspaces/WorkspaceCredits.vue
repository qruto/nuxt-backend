<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { WorkspaceCreditsProps } from '../../parts'
import { useWorkspaceSettingsView } from './workspace-settings'

/** `<WorkspaceSettings>`'s credits: the balance, what was credited and used, a top-up per pack for a billing manager, and a refresh. */
defineOptions({ name: 'WorkspaceCredits' })
defineProps<WorkspaceCreditsProps>()
const view = useWorkspaceSettingsView('WorkspaceCredits')
const { t } = view.labels
const pending = (key: string) => view.context.value.pending === key

// In the template: Busy until the first balance lands; the em dashes mark the
// same moment visually.
</script>

<template>
  <section
    data-settings="section-credits"
    :aria-busy="credits.isLoading.value ? 'true' : undefined"
  >
    <h3 data-settings="section-title">
      {{ t('credits') }}
    </h3>
    <p data-settings="balance">
      {{ credits.balance.value === undefined ? t('balanceUnknown') : t('balance', { count: credits.balance.value }) }}
    </p>
    <p data-settings="usage">
      <span data-settings="credited">{{ t('credited', { count: credits.credited.value ?? '—' }) }}</span>
      ·
      <span data-settings="consumed">{{ t('used', { count: credits.consumed.value ?? '—' }) }}</span>
    </p>
    <div data-settings="topup">
      <template v-if="view.context.value.billing.canManage.value">
        <button
          v-for="pack in view.context.value.packs"
          :key="pack.key"
          data-settings="topup-pack"
          type="button"
          :disabled="!view.products.value[pack.key]"
          v-bind="busyAttributes(pending(`pack:${pack.key}`))"
          @click="view.context.value.buyPack(pack.key)"
        >
          {{ pending(`pack:${pack.key}`) ? t('toppingUp') : t('buyPack', { pack: view.products.value[pack.key]?.name ?? pack.key }) }}
        </button>
      </template>
    </div>
    <button
      data-settings="refresh"
      type="button"
      v-bind="busyAttributes(pending('refresh'))"
      @click="view.context.value.refreshCredits()"
    >
      {{ pending('refresh') ? t('refreshing') : t('refresh') }}
    </button>
  </section>
</template>
