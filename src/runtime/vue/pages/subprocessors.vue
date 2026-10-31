<script setup lang="ts">
import LegalDocument from '../components/shell/LegalDocument.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made subprocessors page, registered by the module at
 * `/legal/subprocessors` (module option `pages.subprocessors`), public: the
 * subprocessor list: each service that processes personal data for the
 * capabilities the app uses, what it handles, where, and its agreement.
 * Filled from `appConfig.backend.legal` and the capabilities the app uses,
 * and marked "not legal advice". An app page at the same path replaces it.
 */
defineOptions({ name: 'SubprocessorsPage' })
const { t } = useLabels('legal')
</script>

<template>
  <PageFrame
    page="subprocessors"
    family="legal"
    :title="t('pages.subprocessors')"
  >
    <LegalDocument page="subprocessors" />
  </PageFrame>
</template>
