<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { APPEAL_FRAGMENT } from '../../../convex/report-rules'
import PageFrame from '../components/shell/PageFrame.vue'
import ReportAppeal from '../components/shell/ReportAppeal.vue'
import ReportNotice from '../components/shell/ReportNotice.vue'
import { useLabels } from '../composables/use-labels'

/**
 * The ready-made report page, registered by the module at `/report`
 * (module option `pages.report`), public: the notice form the EU Digital
 * Services Act asks a host for (Art. 16), with the TAKE IT DOWN Act's
 * intimate-image removal request among its reasons, open to people without
 * an account. Link it beside user content, with `?table=&id=` naming the
 * thing (or `?url=`). A statement of reasons links its author here with
 * the decision's token in the fragment (`#appeal=<token>`), and the page
 * shows the appeal instead. An app page at the same path replaces it; build
 * one on `sendNotice`, `getAppeal` and `appealDecision` from
 * `backend/admin.ts`.
 */
defineOptions({ name: 'ReportPage' })
const { t } = useLabels('report')
// The token stays in the fragment, which no request carries: read once the page is in the browser.
const appealToken = ref<string | null | undefined>(undefined)

onMounted(() => {
  const fragment = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim()
  appealToken.value = fragment.startsWith(APPEAL_FRAGMENT) ? fragment.slice(APPEAL_FRAGMENT.length) || null : null
})
</script>

<template>
  <PageFrame
    page="report"
    family="report"
    :title="t('page.title')"
  >
    <ReportAppeal
      v-if="appealToken !== undefined && appealToken !== null"
      :token="appealToken"
    />
    <ReportNotice v-else />
  </PageFrame>
</template>
