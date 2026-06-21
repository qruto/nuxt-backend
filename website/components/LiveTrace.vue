<script setup lang="ts">
import { computed } from 'vue'

/**
 * A depth-native "live" element: a smooth trace plotted inside a concave well
 * carved into the material — the playground's calm replacement for the old
 * oscilloscope. Pass real `values` (e.g. inflight history) to plot data, or
 * leave it off for an ambient scrolling wave. `live=false` freezes + dims it.
 */
const props = withDefaults(defineProps<{
  values?: number[]
  tone?: 'accent' | 'ok' | 'warn' | 'err'
  height?: number
  /** seconds per ambient sweep — lower is faster */
  speed?: number
  live?: boolean
}>(), { tone: 'accent', height: 88, speed: 8, live: true })

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
</script>

<template>
  <div
    class="trace well"
    :class="[tone, { paused: !live }]"
  >
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
      :style="{ 'height': `${height}px`, '--dur': `${speed}s` }"
      aria-hidden="true"
    >
      <!-- Real-data trace -->
      <polyline
        v-if="isData"
        class="line"
        :points="dataPoints!"
        vector-effect="non-scaling-stroke"
      />
      <!-- Ambient scrolling trace (doubled for seamless loop) -->
      <g
        v-else
        class="beam"
      >
        <polyline
          class="line"
          :points="ambient"
          vector-effect="non-scaling-stroke"
        />
        <polyline
          class="line"
          :points="ambient"
          :transform="`translate(${W} 0)`"
          vector-effect="non-scaling-stroke"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.trace {
  --c: var(--accent);
  padding: 0.4rem 0.55rem;
  overflow: hidden;
}
.trace.accent { --c: var(--accent); }
.trace.ok   { --c: var(--ok); }
.trace.warn { --c: var(--warn); }
.trace.err  { --c: var(--err); }

svg { display: block; width: 100%; overflow: visible; }

.beam { animation: trace-scroll var(--dur) linear infinite; }
.trace.paused .beam { animation-play-state: paused; }

.line {
  fill: none;
  stroke: var(--c);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.9;
}
@media (prefers-color-scheme: dark) {
  .line { filter: drop-shadow(0 0 2px color-mix(in srgb, var(--c) 50%, transparent)); }
}
.trace.paused .line { opacity: 0.3; filter: none; }

@keyframes trace-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-240px); }
}
@media (prefers-reduced-motion: reduce) {
  .beam { animation: none; }
}
</style>
