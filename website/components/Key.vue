<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

/**
 * A machined key, the `k` part: a link when it has `to`, a button
 * otherwise. `size` is `md` (40px), `nav` (the header's 34px) or `xs`
 * (28px chips and copy buttons); `signal` lights it `go` (the one primary
 * on a page) or letters it `warn` / `err`. A link key goes down and lights
 * green on its own page (NuxtLink sets `aria-current`) and, while `pressed`,
 * anywhere in its section (`aria-current="true"`); a button key goes down
 * while `pressed`. A `disabled` link key has no `href`, so it cannot be
 * followed, and says so (`aria-disabled`). A button key that is `loading`
 * is busy, with a spinner before its label: it says it is disabled
 * (`aria-disabled`) and swallows a click, but stays focusable, so the
 * keyboard's focus is not dropped while the action runs; `disabled` is for
 * a key that is unavailable. A key letters its
 * label in uppercase; `code` keeps the case and the spacing of a label
 * that is code or an id (`loadMore(5)`, an invoice number). `wrap` lets a
 * label too long for a phone's column wrap inside the key instead of
 * running out of it.
 */
const props = withDefaults(defineProps<{
  to?: RouteLocationRaw
  size?: 'md' | 'nav' | 'xs'
  signal?: 'go' | 'warn' | 'err'
  pressed?: boolean
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  code?: boolean
  wrap?: boolean
}>(), { to: undefined, size: 'md', signal: undefined, pressed: undefined, type: 'button', disabled: false, loading: false, code: false, wrap: false })

const SIZE = { md: '', nav: 'k-nav', xs: 'k-xs' } as const
const SIGNAL = { go: 'k-go', warn: 'k-warn', err: 'k-err' } as const
// Important, so they win over the part's own lettering and height.
const CODE = 'normal-case! tracking-normal!'
const WRAP = 'h-auto! min-h-[var(--k-h,40px)] max-w-full py-1.5 text-center leading-[1.3]! whitespace-normal!'
const classes = computed(() => ['k', SIZE[props.size], props.signal ? SIGNAL[props.signal] : '', props.code ? CODE : '', props.wrap ? WRAP : ''])
// Bound only while pressed: an `aria-current` of undefined would also clear
// the `page` NuxtLink sets on the key's own page.
const current = computed(() => props.pressed ? { 'aria-current': 'true' as const } : {})

// While loading, a click (and the submit it would start) stops here, before
// the listeners a page binds on the key.
function busy(event: MouseEvent) {
  if (!props.loading) return
  event.preventDefault()
  event.stopImmediatePropagation()
}
</script>

<template>
  <a
    v-if="props.to && props.disabled"
    role="link"
    aria-disabled="true"
    :class="classes"
  >
    <slot />
  </a>
  <NuxtLink
    v-else-if="props.to"
    :to="props.to"
    v-bind="current"
    :class="classes"
  >
    <slot />
  </NuxtLink>
  <button
    v-else
    :type="props.type"
    :disabled="props.disabled"
    :aria-disabled="props.loading ? 'true' : undefined"
    :aria-pressed="props.pressed === undefined ? undefined : props.pressed"
    :aria-busy="props.loading ? 'true' : undefined"
    :class="classes"
    @click.capture="busy"
  >
    <span
      v-if="props.loading"
      class="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-85"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
