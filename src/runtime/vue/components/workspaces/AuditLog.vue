<script setup lang="ts">
import { computed } from 'vue'
import { type AuditScope, useAuditLog } from '../../composables/use-audit-log'
import { type BackendLabels, type LabelOverrides, useLabels } from '../../composables/use-labels'
import { usePageTurns } from '../../utils/page-turns'
import { VNodes } from '../../utils/vnodes'
import PagedList from '../shell/PagedList.vue'
import { type AuditLogSlotContext, type AuditLogSlots, describeAuditEvent, provideAuditLabels } from './audit-log'

/**
 * The activity trail as a list, a page at a time: the signed-in account's
 * own (`scope="mine"`, the default), the active workspace's for its owners
 * and admins (`scope="workspace"`), or every event for administrators
 * (`scope="all"`). Each event (`AuditLogEvent`) is one sentence from the
 * `audit` labels, who acted first, then what the sentence leaves out.
 *
 * `data-audit` attributes for styling, a slot for every region (each
 * receives {@link AuditLogSlotContext}), and its copy from the `audit`
 * labels. Renders its empty state, never an error, when the visitor is
 * signed out, and nothing at all for a caller who may not read the scope,
 * so a page can mount it for everyone.
 *
 * @example
 * ```vue
 * <AuditLog scope="workspace" :limit="10" />
 * ```
 */
defineOptions({ name: 'AuditLog' })

const props = withDefaults(defineProps<{
  /** Whose activity: `mine`, `workspace` or `all`. */
  scope?: AuditScope
  /** The heading. Default: the scope's title label; an empty string for none. */
  title?: string
  /** Events per page, at most 100. Default 20. */
  limit?: number
  /** Copy for this component, over `appConfig.backend.labels.audit` and the translations. */
  labels?: LabelOverrides<BackendLabels['audit']>
}>(), { scope: 'mine', title: undefined, limit: undefined, labels: undefined })
defineEmits({})
const slots = defineSlots<AuditLogSlots>()

const log = useAuditLog({ scope: () => props.scope, limit: () => props.limit })
const labels = useLabels('audit', () => props.labels)
const { t, errorMessage } = labels
provideAuditLabels(labels)
const items = computed(() => log.events.value ?? [])
const context = computed<AuditLogSlotContext>(() => ({
  log,
  items: items.value,
  isLoading: log.isLoading.value,
  error: log.error.value ? errorMessage(log.error.value) : null,
}))
const pages = usePageTurns(log, 'audit')
const heading = computed(() => props.title ?? t(props.scope === 'workspace' ? 'workspaceTitle' : props.scope === 'all' ? 'allTitle' : 'title'))
// Busy while a page loads; the loading and empty notes are polite statuses, the failure an alert.
const busy = computed(() => log.isLoading.value || pages.turning.value !== null)
const firstLoad = computed(() => log.isLoading.value && log.events.value === undefined)
const empty = computed(() => !firstLoad.value && items.value.length === 0 && log.events.value !== undefined && !log.error.value)
</script>

<template>
  <section
    v-if="!log.isRefused.value"
    data-audit="root"
    :aria-busy="busy ? 'true' : undefined"
  >
    <slot
      name="header"
      v-bind="context"
    >
      <h2
        v-if="heading"
        data-audit="header"
      >
        {{ heading }}
      </h2>
    </slot>
    <PagedList
      :family="'audit'"
      :slots="slots"
      :context="context"
      :items="items"
      :first-load="firstLoad"
      :empty="empty"
      :error="log.error.value ? errorMessage(log.error.value) : null"
      :status="pages.turning.value ? t('pageLoading') : ''"
      :pages="pages"
      :words="{ loading: t('loading'), empty: t('empty'), newer: t('newer'), older: t('older'), pageLoading: t('pageLoading') }"
    >
      <template #item="{ item }">
        <VNodes
          v-if="slots.event"
          :nodes="slots.event({ ...context, event: item, ...describeAuditEvent(labels, item) }) as never"
        />
        <AuditLogEvent
          v-else
          :event="item"
        />
      </template>
    </PagedList>
  </section>
</template>
