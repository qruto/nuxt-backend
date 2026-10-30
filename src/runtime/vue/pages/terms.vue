<script setup lang="ts">
import LegalDocument from '../components/shell/LegalDocument.vue'
import PageFrame from '../components/shell/PageFrame.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made terms page, registered by the module at `/legal/terms`
 * (module option `pages.terms`), public: the terms of service: the account,
 * plans and renewal with the merchant of record's role while billing is in
 * use, the content rules, AI features while they are in use, and the
 * contact. Filled from `appConfig.backend.legal` and the capabilities the
 * app uses, and marked "not legal advice". An app page at the same path
 * replaces it.
 */
defineOptions({ name: 'TermsPage' })
const { t } = useLabels('legal')
</script>

<template>
  <PageFrame
    page="terms"
    family="legal"
    :title="t('pages.terms')"
  >
    <LegalDocument page="terms" />
  </PageFrame>
</template>
