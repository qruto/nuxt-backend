<script setup lang="ts">
// Moderation misses things: a signed-in reader's quick report reaches the admin
// console's Reports tab. Signed out, the public notice form takes it, with the
// strip and its address in the link, so every shared strip can be reported.
const props = defineProps<{ stripId: string }>()
const report = useReportForm(() => ({ table: 'strips', id: props.stripId }), {
  mode: 'quick',
  url: () => `${useRequestURL().origin}/strips/${props.stripId}`,
  reasons: ['abuse', 'sexual', 'violence', 'spam', 'other'],
})
const { t } = report.labels
</script>

<template>
  <template v-if="!report.isLoading.value">
    <NuxtLink
      v-if="!report.signedIn.value && report.noticePath.value"
      :to="report.noticePath.value"
    >
      Report this strip
    </NuxtLink>
    <form
      v-else
      v-bind="report.bind.root.value"
    >
      <fieldset v-bind="report.bind.reasons.value">
        <legend>{{ t('content.reason') }}</legend>
        <label
          v-for="reason in report.reasons.value"
          :key="reason"
        >
          <input v-bind="report.bind.reason(reason)">
          {{ t(`reasons.${reason}`) }}
        </label>
      </fieldset>
      <div v-bind="report.bind.honeypot.value">
        <input v-bind="report.bind.honeypotInput.value">
      </div>
      <p
        v-if="report.error.value"
        v-bind="report.bind.errorText.value"
      >
        {{ report.labels.errorMessage(report.error.value) }}
      </p>
      <button v-bind="report.bind.submit.value">
        Report this strip
      </button>
      <p v-bind="report.bind.status.value">
        {{ report.announcement.value }}
      </p>
    </form>
  </template>
</template>
