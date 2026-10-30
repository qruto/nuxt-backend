<script setup lang="ts">
import type { AdminListView } from './admin'

/**
 * The drawer both admin lists open: a native modal dialog named by its
 * title, with its close button first, the loading and not-found notes, the
 * details the list puts in its slot, and the outcome of the last action.
 * Escape is the browser's own close of a modal dialog: it closes here, and
 * focus goes back to the button that opened it.
 *
 * @internal
 */
defineOptions({ name: 'AdminDrawerFrame' })
const props = defineProps<{
  view: AdminListView<unknown, unknown>
  /** The details: `undefined` while they load, `null` when the row is gone. */
  detail: unknown
  title: string
  subtitle?: string | null
  notFound: string
}>()
const { t } = props.view.labels
const dialog = props.view.dialog
const titleId = `${props.view.id}-title`
</script>

<template>
  <dialog
    ref="dialog"
    data-admin="drawer"
    data-state="open"
    :aria-labelledby="titleId"
    :aria-busy="view.running.value || detail === undefined ? 'true' : undefined"
    @cancel.prevent="view.close()"
  >
    <header data-admin="drawer-header">
      <h2
        :id="titleId"
        data-admin="drawer-title"
      >
        {{ title }}
      </h2>
      <p
        v-if="subtitle"
        data-admin="drawer-subtitle"
      >
        {{ subtitle }}
      </p>
      <button
        data-admin="close"
        type="button"
        @click="view.close()"
      >
        {{ t('close') }}
      </button>
    </header>
    <p
      v-if="detail === undefined"
      data-admin="loading"
      role="status"
      aria-live="polite"
    >
      {{ t('loading') }}
    </p>
    <p
      v-else-if="detail === null"
      data-admin="not-found"
      role="alert"
    >
      {{ notFound }}
    </p>
    <slot v-else />
    <p
      v-if="view.message.value"
      data-admin="message"
      :data-tone="view.message.value.ok ? 'ok' : 'error'"
      :role="view.message.value.ok ? 'status' : 'alert'"
      tabindex="-1"
    >
      {{ view.message.value.text }}
    </p>
  </dialog>
</template>
