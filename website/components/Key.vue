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
 * followed, and says so (`aria-disabled`).
 */
const props = withDefaults(defineProps<{
  to?: RouteLocationRaw
  size?: 'md' | 'nav' | 'xs'
  signal?: 'go' | 'warn' | 'err'
  pressed?: boolean
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}>(), { to: undefined, size: 'md', signal: undefined, pressed: undefined, type: 'button', disabled: false })

const SIZE = { md: '', nav: 'k-nav', xs: 'k-xs' } as const
const SIGNAL = { go: 'k-go', warn: 'k-warn', err: 'k-err' } as const
const classes = computed(() => ['k', SIZE[props.size], props.signal ? SIGNAL[props.signal] : ''])
// Bound only while pressed: an `aria-current` of undefined would also clear
// the `page` NuxtLink sets on the key's own page.
const current = computed(() => props.pressed ? { 'aria-current': 'true' as const } : {})
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
    :aria-pressed="props.pressed === undefined ? undefined : props.pressed"
    :class="classes"
  >
    <slot />
  </button>
</template>
