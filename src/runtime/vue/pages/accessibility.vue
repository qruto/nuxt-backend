<script setup lang="ts">
import LegalDocument from '../components/shell/LegalDocument.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made accessibility page, registered by the module at
 * `/legal/accessibility` (module option `pages.accessibility`), public: the
 * accessibility statement: the standard the app follows, how it is checked,
 * the known gaps, and where to report a barrier. Filled from
 * `appConfig.backend.legal` and the capabilities the app uses, and marked
 * "not legal advice". An app page at the same path replaces it.
 */
defineOptions({ name: 'AccessibilityPage' })
const { t } = useLabels('legal')
</script>

<template>
  <PageFrame
    page="accessibility"
    family="legal"
    :title="t('pages.accessibility')"
  >
    <LegalDocument page="accessibility" />
  </PageFrame>
</template>
