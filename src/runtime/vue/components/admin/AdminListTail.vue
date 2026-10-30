<script setup lang="ts">
import type { UseAdminReturn } from '../../composables/use-admin'
import { VNodes } from '../../utils/vnodes'
import type { AdminListView } from './admin'

/**
 * What both admin lists put after their table: why the list could not be
 * read (an alert, unless the drawer is open and says it), the footer, and
 * one status, always there, that says what the busy pager button waits for.
 * The list's `error` and `footer` slots replace their regions.
 *
 * @internal
 */
defineOptions({ name: 'AdminListTail' })
const props = defineProps<{
  view: AdminListView<unknown, { error?: unknown, footer?: unknown }>
  admin: UseAdminReturn
  /** The row open in the drawer, if any: its failures show there. */
  open: boolean
}>()
const { t, errorMessage } = props.view.labels
const slot = (name: 'error' | 'footer') => props.view.slots[name] as ((context: unknown) => unknown) | undefined
</script>

<template>
  <template v-if="admin.error.value && !open">
    <VNodes
      v-if="slot('error')"
      :nodes="slot('error')!(view.context.value) as never"
    />
    <p
      v-else
      data-admin="error"
      role="alert"
    >
      {{ errorMessage(admin.error.value) }}
    </p>
  </template>
  <VNodes
    v-if="slot('footer')"
    :nodes="slot('footer')!(view.context.value) as never"
  />
  <p
    data-admin="status"
    role="status"
    aria-live="polite"
  >
    {{ view.pages.turning.value ? t('pageLoading') : '' }}
  </p>
</template>
