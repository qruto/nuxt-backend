<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

/**
 * Homepage architecture diagram — how the two halves fit together.
 *
 * Nuxt owns the UI, routing and a same-origin `/api/auth` proxy; Convex owns
 * Better Auth persistence and real-time data. Animated flow lines show auth
 * (same-origin cookies) and live WebSocket subscriptions. The status chip is
 * genuinely live — it reflects THIS page's WebSocket to Convex.
 */
// The live chip is inherently client-only. Calling the composable during SSR /
// prerender would open a Convex WebSocket (the lazy `.sync` client) and keep the
// build process alive, so only subscribe on the client.
const conn = import.meta.client ? useConvexConnectionState() : null
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

const connected = computed(() => mounted.value && !!conn?.value.isWebSocketConnected)
const chip = computed(() => {
  if (!mounted.value) return { text: 'connecting…', cls: 'idle' }
  return connected.value
    ? { text: 'this page is live on Convex', cls: 'on' }
    : { text: 'reconnecting…', cls: 'off' }
})
</script>

<template>
  <section class="home-section">
    <div class="home-wrap">
      <p class="eyebrow">
        <span class="dot" /> Architecture
      </p>
      <h2 class="home-title">
        One app. Two halves. Zero servers.
      </h2>
      <p class="home-lead">
        Nuxt owns the UI, routing, and a same-origin auth proxy. Convex owns
        Better Auth persistence and real-time data. <code>nuxt-backend</code>
        keeps them aligned — and there's no server for you to run.
      </p>

      <div class="diagram">
        <svg
          viewBox="0 0 760 250"
          fill="none"
          role="img"
          aria-label="Nuxt app talks to Convex over a same-origin auth proxy and a live WebSocket"
        >
          <defs>
            <linearGradient
              id="nodeGrad"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0"
                class="grad-hi"
              />
              <stop
                offset="1"
                class="grad-lo"
              />
            </linearGradient>
          </defs>
          <!-- Auth path: browser → /api/auth → Convex -->
          <path
            class="lane flow-r"
            d="M240 96 C 290 96 290 48 332 48"
          />
          <path
            class="lane flow-r"
            d="M428 48 C 470 48 470 96 520 96"
          />
          <!-- Data lanes: live WebSocket, bidirectional -->
          <line
            class="lane accent flow-r"
            x1="240"
            y1="150"
            x2="520"
            y2="150"
          />
          <line
            class="lane accent flow-l"
            x1="240"
            y1="170"
            x2="520"
            y2="170"
          />

          <!-- Proxy chip -->
          <rect
            class="chip"
            x="330"
            y="28"
            width="100"
            height="40"
            rx="8"
          />
          <text
            class="mono mid"
            x="380"
            y="52"
          >/api/auth</text>

          <!-- Nuxt node -->
          <rect
            class="node"
            x="28"
            y="62"
            width="212"
            height="126"
            rx="14"
          />
          <line
            class="rim"
            x1="42"
            y1="63.5"
            x2="226"
            y2="63.5"
          />
          <text
            class="title"
            x="134"
            y="112"
          >Your Nuxt app</text>
          <text
            class="mono sub"
            x="134"
            y="138"
          >UI · routing · SSR</text>
          <text
            class="mono sub dim"
            x="134"
            y="158"
          >/api/auth proxy</text>

          <!-- Convex node -->
          <rect
            class="node"
            x="520"
            y="62"
            width="212"
            height="126"
            rx="14"
          />
          <line
            class="rim"
            x1="534"
            y1="63.5"
            x2="718"
            y2="63.5"
          />
          <text
            class="title"
            x="626"
            y="108"
          >Convex</text>
          <text
            class="mono sub"
            x="626"
            y="134"
          >Better Auth</text>
          <text
            class="mono sub accent-tx"
            x="626"
            y="156"
          >Data · real-time</text>

          <!-- Lane labels -->
          <text
            class="mono tag"
            x="380"
            y="92"
          >same-origin cookies</text>
          <text
            class="mono tag accent-tx"
            x="380"
            y="196"
          >live WebSocket</text>
        </svg>

        <div
          class="status"
          :class="chip.cls"
        >
          <span class="led" />
          {{ chip.text }}
          <code>useConvexConnectionState()</code>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-section { padding: clamp(3rem, 8vw, 6.5rem) 1.25rem; background: var(--bg); }
.home-wrap { margin: 0 auto; max-width: 56rem; text-align: center; }

.eyebrow {
  display: inline-flex; align-items: center; gap: 0.55rem;
  margin: 0 0 1rem; padding: 0.35rem 0.85rem 0.35rem 0.7rem; border-radius: 999px;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em;
  color: var(--ink-dim); background: var(--surface); box-shadow: var(--elev-1);
}
.eyebrow .dot {
  width: 7px; height: 7px; border-radius: 999px;
  background: var(--accent); box-shadow: var(--glow-accent-soft);
}
.home-title {
  margin: 0 auto; max-width: 20ch; font-family: var(--display);
  font-size: clamp(1.9rem, 4.5vw, 3rem); font-weight: 700;
  letter-spacing: -0.02em; line-height: 1.05; color: var(--ink);
}
.home-lead {
  margin: 1rem auto 0; max-width: 52ch; font-size: 1.04rem; line-height: 1.6;
  color: var(--ink-dim);
}
.home-lead code { font-family: var(--mono); font-size: 0.9em; color: var(--accent-soft); }

.diagram {
  margin: 2.5rem auto 0; max-width: 48rem; padding: 1.6rem 1.4rem 0.85rem;
  border: 1px solid transparent; border-radius: var(--r-lg);
  background: var(--grad-surface) padding-box, var(--grad-bevel) border-box;
  box-shadow: var(--elev-3);
}
.diagram svg { display: block; width: 100%; height: auto; overflow: visible; }

.node {
  fill: url(#nodeGrad); stroke: var(--edge-hi); stroke-width: 1;
  filter: drop-shadow(3px 6px 10px rgb(0 0 0 / 0.18));
}
/* SVG gradient stops can't read CSS vars directly via `stop-color: var()` in all
   engines, so map them through classed stops that DO resolve the vars. */
.grad-hi { stop-color: var(--surface-hi); }
.grad-lo { stop-color: var(--surface); }
/* Top rim highlight — the lit edge of each raised node (light from top-left). */
.rim { stroke: var(--surface-hi); stroke-width: 1.5; stroke-linecap: round; opacity: 0.9; }
.chip { fill: var(--sink); stroke: var(--edge-hi); stroke-width: 1; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.18)); }

.title { fill: var(--ink); font: 700 17px var(--display); text-anchor: middle; }
.mono { font-family: var(--mono); text-anchor: middle; }
.mid { fill: var(--ink); font-size: 12px; font-weight: 600; }
.sub { fill: var(--ink-dim); font-size: 12px; }
.sub.dim { fill: var(--ink-faint); }
.tag { fill: var(--ink-faint); font-size: 10.5px; letter-spacing: 0.04em; }
.accent-tx { fill: var(--accent-soft); }

.lane { stroke: var(--edge-hi); stroke-width: 2; stroke-dasharray: 5 7; stroke-linecap: round; }
.lane.accent { stroke: var(--accent); opacity: 0.95; filter: drop-shadow(0 0 5px var(--accent-glow)); }
.flow-r { animation: march-r 0.9s linear infinite; }
.flow-l { animation: march-l 0.9s linear infinite; }

.status {
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  flex-wrap: wrap; margin: 0.75rem 0 0.5rem; padding: 0.6rem;
  font-family: var(--mono); font-size: 0.74rem; color: var(--ink-dim);
}
.status .led {
  width: 8px; height: 8px; border-radius: 999px; background: var(--ink-faint);
  transition: background 0.3s, box-shadow 0.3s;
}
.status.on { color: var(--ink); }
.status.on .led { background: var(--ok); box-shadow: var(--glow-ok); animation: beat 2s ease-in-out infinite; }
.status.off .led { background: var(--err); }
.status code { color: var(--ink-faint); font-size: 0.9em; }

@keyframes march-r { to { stroke-dashoffset: -24; } }
@keyframes march-l { to { stroke-dashoffset: 24; } }
@keyframes beat { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) {
  .lane, .status .led, .eyebrow .dot { animation: none; }
}
</style>
