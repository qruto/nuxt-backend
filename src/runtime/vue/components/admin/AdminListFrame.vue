<script setup lang="ts">
import { computed } from 'vue'
import type { UseAdminReturn } from '../../composables/use-admin'
import { VNodes } from '../../utils/vnodes'
import ListPager from '../shell/ListPager.vue'
import type { AdminListView } from './admin'

/**
 * What both admin lists put around their table: the search in a `search`
 * landmark, the loading and empty notes, and the pager, each replaced by
 * the list's slot when the app fills it.
 *
 * @internal
 */
defineOptions({ name: 'AdminListFrame' })
const props = defineProps<{
  view: AdminListView<unknown, { loading?: unknown, empty?: unknown, pager?: unknown }>
  admin: UseAdminReturn
  /** The rows the list read, `undefined` until the first page lands. */
  rows: readonly unknown[] | undefined
  searchLabel: string
  emptyText: string
}>()
const { t } = props.view.labels
const query = props.view.query
const slot = (name: 'loading' | 'empty' | 'pager') => props.view.slots[name] as ((context: unknown) => unknown) | undefined
const firstLoad = computed(() => props.admin.isLoading.value && props.rows === undefined)
const empty = computed(() => !firstLoad.value && props.rows !== undefined && props.rows.length === 0 && !props.admin.error.value)
</script>

<template>
  <div data-admin="list">
    <form
      data-admin="search"
      role="search"
      @submit.prevent="view.submit()"
    >
      <label data-admin="label">
        {{ searchLabel }}
        <input
          v-model="query"
          data-admin="input-search"
          type="search"
          autocomplete="off"
          @input="view.typed(query)"
        >
      </label>
    </form>
    <template v-if="firstLoad">
      <VNodes
        v-if="slot('loading')"
        :nodes="slot('loading')!(view.context.value) as never"
      />
      <p
        v-else
        data-admin="loading"
        role="status"
        aria-live="polite"
      >
        {{ t('loading') }}
      </p>
    </template>
    <slot v-else-if="rows && rows.length > 0" />
    <template v-else-if="empty">
      <VNodes
        v-if="slot('empty')"
        :nodes="slot('empty')!(view.context.value) as never"
      />
      <p
        v-else
        data-admin="empty"
        role="status"
        aria-live="polite"
      >
        {{ emptyText }}
      </p>
    </template>
    <VNodes
      v-if="slot('pager')"
      :nodes="slot('pager')!(view.context.value) as never"
    />
    <ListPager
      v-else
      :pages="view.pages"
      :labels="{ newer: t('newer'), older: t('older'), loading: t('pageLoading') }"
    />
  </div>
</template>
