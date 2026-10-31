<script setup lang="ts">
import { computed } from 'vue'
import { useMaintenanceNotice } from '../../composables/use-flags'
import { useLabels } from '../../composables/use-labels'
import { useShownFirst } from '../../utils/shown-first'
import { VNodes } from '../../utils/vnodes'
import { type MaintenanceNoticeContext, turnedOff } from './notices'

/**
 * `<BackendNotices>`' maintenance notice, while an administrator has the
 * `maintenance` switch on: their message, or a default sentence. Read live
 * in the browser, so it appears and goes as the switch turns, with no
 * reload; the server renders none.
 *
 * @internal
 */
defineOptions({ name: 'NoticeMaintenance' })
const props = defineProps<{ slotContent?: (context: MaintenanceNoticeContext) => unknown }>()
const { t } = useLabels('maintenance')
const notice = useMaintenanceNotice()
const shown = useShownFirst('maintenance')
const context = computed<MaintenanceNoticeContext>(() => ({ message: notice.value?.message || t('message') }))
</script>

<template>
  <aside
    v-if="notice && shown && !turnedOff(props.slotContent, context)"
    data-maintenance="banner"
    :aria-label="t('label')"
  >
    <VNodes
      v-if="props.slotContent"
      :nodes="props.slotContent(context) as never"
    />
    <p
      v-else
      data-maintenance="message"
    >
      {{ context.message }}
    </p>
  </aside>
</template>
