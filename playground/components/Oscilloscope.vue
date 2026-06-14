<script setup lang="ts">
import { computed } from 'vue'

/**
 * A phosphor oscilloscope trace — the signature motif of the Signal Lab.
 * Pure SVG + CSS: a scrolling composite-sine waveform over a faint grid,
 * with a glowing leading dot. The `live` flag controls whether the beam
 * animates (idle = frozen trace when the WebSocket is down).
 */
const props = withDefaults(defineProps<{
  tone?: 'signal' | 'ok' | 'warn' | 'xp' | 'err'
  height?: number
  /** seconds per full sweep — lower is faster */
  speed?: number
  /** 0..1 vertical amplitude */
  amp?: number
  /** wave periods across one tile */
  density?: number
  live?: boolean
  grid?: boolean
}>(), {
  tone: 'signal',
  height: 96,
  speed: 7,
  amp: 0.66,
  density: 2.4,
  live: true,
  grid: true,
})

const W = 240
const H = 100

const points = computed(() => {
  const pts: string[] = []
  const steps = 160
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W
    const t = (i / steps) * Math.PI * 2 * props.density
    const y
      = H / 2
        + Math.sin(t) * (H / 2) * props.amp * 0.62
        + Math.sin(t * 2.3 + 1.1) * (H / 2) * props.amp * 0.24
        + Math.sin(t * 5.1 + 0.4) * (H / 2) * props.amp * 0.08
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return pts.join(' ')
})
</script>

<template>
  <svg
    class="scope"
    :class="[tone, { paused: !live }]"
    :viewBox="`0 0 ${W} ${H}`"
    preserveAspectRatio="none"
    :style="{ 'height': `${height}px`, '--dur': `${speed}s` }"
    aria-hidden="true"
  >
    <g
      v-if="grid"
      class="scope-grid"
    >
      <line
        v-for="gx in 8"
        :key="`v${gx}`"
        :x1="(gx / 8) * W"
        y1="0"
        :x2="(gx / 8) * W"
        :y2="H"
      />
      <line
        v-for="gy in 3"
        :key="`h${gy}`"
        x1="0"
        :y1="(gy / 4) * H"
        :x2="W"
        :y2="(gy / 4) * H"
      />
    </g>
    <g class="scope-beam">
      <polyline
        class="trace"
        :points="points"
        vector-effect="non-scaling-stroke"
      />
      <polyline
        class="trace"
        :points="points"
        :transform="`translate(${W} 0)`"
        vector-effect="non-scaling-stroke"
      />
    </g>
  </svg>
</template>

<style scoped>
.scope {
  display: block;
  width: 100%;
  overflow: visible;
  --c: var(--signal);
}
.scope.signal { --c: var(--signal); }
.scope.ok     { --c: var(--ok); }
.scope.warn   { --c: var(--warn); }
.scope.xp     { --c: var(--xp); }
.scope.err    { --c: var(--err); }

.scope-grid line {
  stroke: var(--edge);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  opacity: 0.5;
}

.scope-beam {
  animation: scope-scroll var(--dur) linear infinite;
}
.scope.paused .scope-beam { animation-play-state: paused; }

.trace {
  fill: none;
  stroke: var(--c);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.9;
}
/* Subtle glow only in dark mode; a clean trace reads better on light paper. */
@media (prefers-color-scheme: dark) {
  .trace { filter: drop-shadow(0 0 4px var(--c)); }
}
.scope.paused .trace { opacity: 0.32; filter: none; }

@keyframes scope-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-240px); }
}

@media (prefers-reduced-motion: reduce) {
  .scope-beam { animation: none; }
}
</style>
