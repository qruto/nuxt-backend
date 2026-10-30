<script setup lang="ts">
import LegalDocument from '../components/shell/LegalDocument.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made privacy page, registered by the module at `/legal/privacy`
 * (module option `pages.privacy`), public: the privacy policy: who runs the
 * app, what it keeps and for how long (the data map), who processes it, the
 * cookies and storage it sets, and how a person gets their data or has it
 * deleted. Filled from `appConfig.backend.legal` and the capabilities the
 * app uses, and marked "not legal advice". An app page at the same path
 * replaces it.
 */
defineOptions({ name: 'PrivacyPage' })
const { t } = useLabels('legal')
</script>

<template>
  <PageFrame
    page="privacy"
    family="legal"
    :title="t('pages.privacy')"
  >
    <LegalDocument page="privacy" />
  </PageFrame>
</template>
