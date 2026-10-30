<script setup lang="ts">
import { formatShare, formatSize } from '../../../../src/analyze/sizes'
import type { BundleInsight } from '../../../../src/analyze/types'
import type { Signal } from '~/utils/signal'

// What `nuxt-backend analyze` measured last, kept on disk: the backend's
// bundle and, once the command has built the app, the browser and server
// bundles. Opening the tab reads that run; only the key measures again,
// because a run bundles the backend's functions once more.

const state = usePanelState()
const panel = usePanel()

onMounted(() => void panel.loadBundles())

const bundles = computed(() => state.bundles?.report?.bundles ?? [])
const failures = computed(() => state.bundles?.report?.failures ?? [])
const ranAt = computed(() => state.bundles?.report?.ranAt ? new Date(state.bundles.report.ranAt).toLocaleString() : null)

const INSIGHT_SIGNAL: Record<BundleInsight['level'], Signal> = { warn: 'warn', info: 'off' }
</script>

<template>
  <PanelCard title="Bundles">
    <template #actions>
      <NButton
        n="xs"
        icon="carbon-renew"
        :disabled="state.bundlesRunning"
        title="Measure the backend's bundle again"
        @click="panel.runBundles()"
      >
        {{ state.bundlesRunning ? 'Measuring…' : 'Refresh' }}
      </NButton>
    </template>
    <p class="op65">
      The last <code>npx nuxt-backend analyze</code> run{{ ranAt ? `, ${ranAt}` : '' }}. The key measures the
      backend's bundle again (<code>analyze --only convex</code>); it never runs on its own. The browser and server
      bundles come from the command, which builds the app.
    </p>
    <NTip
      v-if="state.bundles?.status === 'unavailable'"
      n="red"
      icon="carbon-warning"
    >
      {{ state.bundles.reason }}
    </NTip>
    <NTip
      v-for="failure of failures"
      :key="failure.half"
      n="amber"
      icon="carbon-warning"
    >
      {{ failure.half }}: {{ failure.message }}
    </NTip>
    <p
      v-if="state.bundles?.status === 'empty'"
      class="op50"
    >
      No run yet. Press Refresh to measure the backend's bundle.
    </p>
  </PanelCard>

  <PanelCard
    v-for="bundle of bundles"
    :key="bundle.id"
    :title="bundle.title"
  >
    <p>
      <span class="font-mono">{{ formatSize(bundle.bytes) }}</span> of code
      <template v-if="bundle.gzipBytes !== undefined">
        · <span class="font-mono">{{ formatSize(bundle.gzipBytes) }}</span> gzipped
      </template>
      <template v-if="bundle.sourceMapBytes !== undefined">
        · <span class="font-mono">{{ formatSize(bundle.sourceMapBytes) }}</span> of source maps
      </template>
    </p>
    <ol class="flex flex-col gap-1">
      <li
        v-for="share of bundle.shares"
        :key="share.id"
        class="flex items-center gap-2 text-xs"
      >
        <span class="w-28 shrink-0">{{ share.label }}</span>
        <span class="flex-1 h-2 rounded n-bg-active of-hidden">
          <span
            class="block h-full bg-gray-500 op60"
            :style="{ width: `${Math.max(share.share * 100, share.bytes > 0 ? 1 : 0)}%` }"
          />
        </span>
        <span class="font-mono w-16 text-right">{{ formatSize(share.bytes) }}</span>
        <span class="font-mono w-10 text-right op65">{{ formatShare(share.bytes, bundle.bytes) }}</span>
      </li>
    </ol>
    <details>
      <summary class="cursor-pointer op65 text-xs">
        Largest packages
      </summary>
      <ol class="flex flex-col gap-1 pt1">
        <li
          v-for="item of bundle.packages"
          :key="`${item.name}@${item.version ?? ''}`"
          class="flex items-start gap-2 text-xs"
        >
          <span class="flex-1 font-mono break-all">{{ item.version ? `${item.name}@${item.version}` : item.name }}</span>
          <span class="font-mono">{{ formatSize(item.bytes) }}</span>
        </li>
      </ol>
    </details>
    <ol
      v-if="bundle.insights.length > 0"
      class="flex flex-col gap-1"
    >
      <li
        v-for="insight of bundle.insights"
        :key="`${insight.kind}-${insight.subject ?? insight.title}`"
        class="flex items-start gap-2 py1 border-b n-border-base"
      >
        <Led :signal="INSIGHT_SIGNAL[insight.level]" />
        <span class="flex-1 min-w-0 text-xs break-words">
          {{ insight.title }}
          <span
            v-if="insight.savedBytes > 0"
            class="op65"
          >(saves about {{ formatSize(insight.savedBytes) }})</span>
        </span>
      </li>
    </ol>
    <p
      v-for="note of bundle.notes"
      :key="note"
      class="text-xs op50"
    >
      {{ note }}
    </p>
  </PanelCard>
</template>
