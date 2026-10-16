<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

/**
 * A machined key, the `k` part: a link when it has `to`, a button
 * otherwise. `size` is `md` (40px), `nav` (the header's 34px) or `xs`
 * (28px chips and copy buttons); `signal` lights it `go` (the one primary
 * on a page) or letters it `warn` / `err`. A link key goes down and lights
 * green on its own page (NuxtLink sets `aria-current`); a button key goes
 * down while `pressed`.
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
</script>

<template>
  <NuxtLink
    v-if="props.to"
    :to="props.to"
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
