<script setup lang="ts">
/**
 * The mark and the wordmark, as the docs header wears them
 * (AppHeaderLogo.vue), with a stamped line under the name: the playground's
 * topbar, the sign-in card and the offline card.
 *
 * The mark is the machined plate with its three tritium bars
 * (public/logo-light.svg and logo-dark.svg), drawn inline so a page
 * downloads nothing for it: its metal follows `color-scheme` through
 * `light-dark()`, which the site's colour-mode toggle sets and the
 * standalone example takes from the system. It is decorative; the
 * wordmark names the product.
 *
 * On the narrowest phones the stamped line drops out. With `compact` (a bar
 * with keys beside it) the whole wordmark does too, below 520px; screen
 * readers still read it.
 */
const props = withDefaults(defineProps<{
  /** The stamped line under the name: `playground`, `access`. */
  sub: string
  compact?: boolean
}>(), { compact: false })

// Ids of the mark's gradients and glow, unique to this nameplate.
const id = useId()

// The tritium bars, top to bottom: go, attention, danger. A light is a
// light on either plate, so they are the same in both schemes.
const BARS = [
  { y: 13, glow: '#4ade80', core: '#c4ffd6', opacity: 0.9 },
  { y: 20.5, glow: '#facc15', core: '#ffeaa0', opacity: 0.85 },
  { y: 28, glow: '#f87171', core: '#ffb8b0', opacity: 0.85 },
]
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-2.5">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 44 44"
      width="32"
      height="32"
      class="block size-8 flex-none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          :id="`${id}-face`"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0"
            style="stop-color: light-dark(#f0f1f3, #3a3e46)"
          />
          <stop
            offset="1"
            style="stop-color: light-dark(#d6d9de, #17191d)"
          />
        </linearGradient>
        <linearGradient
          :id="`${id}-rim`"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0"
            style="stop-color: light-dark(rgb(255 255 255 / 0.9), rgb(255 255 255 / 0.4))"
          />
          <stop
            offset="0.5"
            stop-color="#fff"
            stop-opacity="0"
          />
          <stop
            offset="1"
            style="stop-color: light-dark(rgb(0 0 0 / 0.32), rgb(0 0 0 / 0.65))"
          />
        </linearGradient>
        <filter
          :id="`${id}-glow`"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      <rect
        x="1"
        y="1"
        width="42"
        height="42"
        rx="11"
        style="fill: light-dark(#aeb2b9, #0a0b0d)"
      />
      <rect
        x="1.5"
        y="1.5"
        width="41"
        height="41"
        rx="10.5"
        :fill="`url(#${id}-face)`"
      />
      <rect
        x="1.5"
        y="1.5"
        width="41"
        height="41"
        rx="10.5"
        fill="none"
        :stroke="`url(#${id}-rim)`"
        stroke-width="1"
      />
      <g fill="#0a0b0d">
        <rect
          x="11"
          y="12"
          width="22"
          height="5"
          rx="2.5"
        />
        <rect
          x="11"
          y="19.5"
          width="22"
          height="5"
          rx="2.5"
        />
        <rect
          x="11"
          y="27"
          width="22"
          height="5"
          rx="2.5"
        />
      </g>
      <g
        v-for="bar in BARS"
        :key="bar.y"
      >
        <rect
          x="12"
          :y="bar.y"
          width="20"
          height="3"
          rx="1.5"
          :fill="bar.glow"
          :filter="`url(#${id}-glow)`"
          :opacity="bar.opacity"
        />
        <rect
          x="12"
          :y="bar.y"
          width="20"
          height="3"
          rx="1.5"
          :fill="bar.core"
        />
      </g>
    </svg>
    <span
      class="grid min-w-0 gap-1"
      :class="{ 'max-[520px]:sr-only': props.compact }"
    >
      <span class="font-display text-[1.02rem] leading-none font-bold tracking-[0.01em] whitespace-nowrap emb-sm [font-stretch:118%]">nuxt-backend</span>
      <span class="stamp max-[380px]:sr-only">{{ props.sub }}</span>
    </span>
  </span>
</template>
