<script setup lang="ts">
import { computed } from 'vue'

/**
 * A depth-native "live" element: a smooth trace plotted inside a `slot`
 * milled into the material — the playground's calm replacement for the old
 * oscilloscope. Pass real `values` (e.g. inflight history) to plot data, or
 * leave it off for an ambient scrolling wave. `live=false` freezes + dims it.
 */
const props = withDefaults(defineProps<{
  values?: number[]
  /** The trace line is a signal: ok (green, default), warn (amber), err (red). */
  tone?: 'ok' | 'warn' | 'err'
  height?: number
  /** seconds per ambient sweep — lower is faster */
  speed?: number
  live?: boolean
}>(), { tone: 'ok', height: 88, speed: 8, live: true })

const W = 240
const H = 100

// Ambient composite sine (used when no `values` are supplied).
const ambient = computed(() => {
  const pts: string[] = []
  const steps = 160
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W
    const t = (i / steps) * Math.PI * 2 * 2.2
    const y = H / 2
      + Math.sin(t) * (H / 2) * 0.42
      + Math.sin(t * 2.3 + 1.1) * (H / 2) * 0.16
      + Math.sin(t * 5.1 + 0.4) * (H / 2) * 0.06
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return pts.join(' ')
})

// Data trace from real values, normalized to the viewBox.
const dataPoints = computed(() => {
  const v = props.values
  if (!v || v.length === 0) return null
  const max = Math.max(1, ...v)
  const n = v.length
  return v
    .map((val, i) => {
      const x = n === 1 ? W : (i / (n - 1)) * W
      const y = H - 8 - (val / max) * (H - 16)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
})

const isData = computed(() => dataPoints.value !== null)

// The trace is lettered in its signal (`--c`); in the dark it glows a little.
// Spelled out, so Tailwind's scan finds every class it must emit.
const TONE = { ok: '[--c:var(--ok)]', warn: '[--c:var(--warn)]', err: '[--c:var(--err)]' } as const
const line = computed(() => props.live
  ? 'opacity-90 [filter:drop-shadow(0_0_2px_light-dark(transparent,color-mix(in_srgb,var(--c)_50%,transparent)))]'
  : 'opacity-30')
</script>

<template>
  <div
    class="slot overflow-hidden px-2 py-1.5 [--slot-r:var(--r-lg)]"
    :class="TONE[tone]"
  >
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
      class="block w-full overflow-visible"
      :style="{ 'height': `${height}px`, '--dur': `${speed}s` }"
      aria-hidden="true"
    >
      <!-- Real-data trace -->
      <polyline
        v-if="isData"
        class="fill-none stroke-(--c) stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]"
        :class="line"
        :points="dataPoints!"
        vector-effect="non-scaling-stroke"
      />
      <!-- Ambient scrolling trace (doubled for seamless loop) -->
      <g
        v-else
        class="animate-[trace-scroll_var(--dur)_linear_infinite] motion-reduce:animate-none"
        :class="{ '[animation-play-state:paused]': !live }"
      >
        <polyline
          class="fill-none stroke-(--c) stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]"
          :class="line"
          :points="ambient"
          vector-effect="non-scaling-stroke"
        />
        <polyline
          class="fill-none stroke-(--c) stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]"
          :class="line"
          :points="ambient"
          :transform="`translate(${W} 0)`"
          vector-effect="non-scaling-stroke"
        />
      </g>
    </svg>
  </div>
</template>
