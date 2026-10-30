<script setup lang="ts" generic="Item extends { id: string }">
import type { PageTurns } from '../../utils/page-turns'
import { VNodes } from '../../utils/vnodes'
import ListPager from './ListPager.vue'

/**
 * The body every paged history list shares (`<BillingHistory>`,
 * `<UsageHistory>`, `<AuditLog>`): a polite loading note for the first
 * page, the rows, a polite empty note once a read found none and nothing
 * after a failed read, which the alert explains; the pager; the footer; and
 * one status, always there, that says what the busy pager button waits for.
 * Each region is the list's own slot when the app fills it.
 *
 * @internal
 */
defineOptions({ name: 'PagedList' })
const props = defineProps<{
  /** The list's `data-*` family. */
  family: string
  /** The list's slots, which replace a region each, and what they receive. */
  slots: Partial<Record<'loading' | 'empty' | 'pager' | 'error' | 'footer', (context: never) => unknown>>
  context: object
  items: readonly Item[]
  firstLoad: boolean
  empty: boolean
  /** Why the list could not be read, in words, or `null`. */
  error: string | null
  /** What the status announces. */
  status: string
  pages: PageTurns
  words: { loading: string, empty: string, newer: string, older: string, pageLoading: string }
}>()
defineSlots<{ item: (props: { item: Item }) => unknown }>()
const hook = (value: string) => ({ [`data-${props.family}`]: value })
const slot = (name: keyof typeof props.slots) => props.slots[name] as ((context: object) => unknown) | undefined
</script>

<template>
  <template v-if="firstLoad">
    <VNodes
      v-if="slot('loading')"
      :nodes="slot('loading')!(context) as never"
    />
    <p
      v-else
      v-bind="hook('loading')"
      role="status"
      aria-live="polite"
    >
      {{ words.loading }}
    </p>
  </template>
  <div
    v-else-if="items.length > 0"
    v-bind="hook('list')"
  >
    <template
      v-for="item in items"
      :key="item.id"
    >
      <slot
        name="item"
        :item="item"
      />
    </template>
  </div>
  <template v-else-if="empty">
    <VNodes
      v-if="slot('empty')"
      :nodes="slot('empty')!(context) as never"
    />
    <p
      v-else
      v-bind="hook('empty')"
      role="status"
      aria-live="polite"
    >
      {{ words.empty }}
    </p>
  </template>
  <VNodes
    v-if="slot('pager')"
    :nodes="slot('pager')!(context) as never"
  />
  <ListPager
    v-else
    :pages="pages"
    :labels="{ newer: words.newer, older: words.older, loading: words.pageLoading }"
  />
  <template v-if="error">
    <VNodes
      v-if="slot('error')"
      :nodes="slot('error')!(context) as never"
    />
    <p
      v-else
      v-bind="hook('error')"
      role="alert"
    >
      {{ error }}
    </p>
  </template>
  <VNodes
    v-if="slot('footer')"
    :nodes="slot('footer')!(context) as never"
  />
  <p
    v-bind="hook('status')"
    role="status"
    aria-live="polite"
  >
    {{ status }}
  </p>
</template>
