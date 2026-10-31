<script setup lang="ts">
/**
 * What a console tab shows before its data arrives: why it could not be
 * read (an alert), else that it is still loading. A tab puts it last in
 * the chain after its refused and data branches, so a refetch with data on
 * screen shows neither.
 *
 * Internal: a part of each console tab.
 *
 * @internal
 */
import { useLabels } from '../../composables/use-labels'

defineOptions({ name: 'AdminTabStatus' })
defineProps<{
  /** Why the tab's data could not be read; unset while it is still loading. */
  error?: unknown
}>()
const { t, errorMessage } = useLabels('admin')
</script>

<template>
  <p
    v-if="error"
    data-admin="error"
    role="alert"
  >
    {{ errorMessage(error) }}
  </p>
  <p
    v-else
    data-admin="loading"
    role="status"
    aria-live="polite"
  >
    {{ t('loading') }}
  </p>
</template>
