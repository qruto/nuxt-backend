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
      <p class="eyebrow engraved-sm">
        Architecture
      </p>
      <h2 class="home-title engraved">
        One app. Two halves. Zero servers.
      </h2>
      <p class="home-lead">
        Nuxt owns the UI, routing, and a same-origin auth proxy. Convex owns
        Better Auth persistence and real-time data. <code>nuxt-backend</code>
        keeps them aligned — and there's no server for you to run.
      </p>

      <div class="diagram plaque noise">
        <svg
          viewBox="0 0 760 250"
          fill="none"
          role="img"
          aria-label="Nuxt app talks to Convex over a same-origin auth proxy and a live WebSocket"
        >
          <!-- Auth path: browser → /api/auth → Convex. Neutral lanes are
               engraved grooves: a dark copy up-left + a light copy down-right
               under the groove line (same grammar as the engraved type). -->
          <g class="groove">
            <path
              class="g-dark"
              d="M240 96 C 290 96 290 48 332 48"
            />
            <path
              class="g-lite"
              d="M240 96 C 290 96 290 48 332 48"
            />
            <path
              class="g-base"
              d="M240 96 C 290 96 290 48 332 48"
            />
            <path
              class="g-dark"
              d="M428 48 C 470 48 470 96 520 96"
            />
            <path
              class="g-lite"
              d="M428 48 C 470 48 470 96 520 96"
            />
            <path
              class="g-base"
              d="M428 48 C 470 48 470 96 520 96"
            />
          </g>
          <!-- Data lanes: live WebSocket, bidirectional — the diagram's only
               orange, kept marching. -->
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

          <!-- Proxy chip — a small milled pocket -->
          <g class="pocket">
            <rect
              class="p-dark"
              x="330"
              y="28"
              width="100"
              height="40"
              rx="8"
            />
            <rect
              class="p-lite"
              x="330"
              y="28"
              width="100"
              height="40"
              rx="8"
            />
            <rect
              class="p-base"
              x="330"
              y="28"
              width="100"
              height="40"
              rx="8"
            />
          </g>
          <text
            class="mono mid"
            x="380"
            y="52"
          >/api/auth</text>

          <!-- Nuxt node — a milled pocket -->
          <g class="pocket">
            <rect
              class="p-dark"
              x="28"
              y="62"
              width="212"
              height="126"
              rx="14"
            />
            <rect
              class="p-lite"
              x="28"
              y="62"
              width="212"
              height="126"
              rx="14"
            />
            <rect
              class="p-base"
              x="28"
              y="62"
              width="212"
              height="126"
              rx="14"
            />
          </g>
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

          <!-- Convex node — a milled pocket -->
          <g class="pocket">
            <rect
              class="p-dark"
              x="520"
              y="62"
              width="212"
              height="126"
              rx="14"
            />
            <rect
              class="p-lite"
              x="520"
              y="62"
              width="212"
              height="126"
              rx="14"
            />
            <rect
              class="p-base"
              x="520"
              y="62"
              width="212"
              height="126"
              rx="14"
            />
          </g>
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
  margin: 0 0 1.2rem;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.home-title {
  margin: 0 auto; max-width: 20ch; font-family: var(--display);
  font-size: clamp(1.9rem, 4.5vw, 3rem); font-weight: 600;
  letter-spacing: -0.005em; line-height: 1.1;
}
.home-lead {
  margin: 1rem auto 0; max-width: 52ch; font-size: 1.04rem; line-height: 1.6;
  color: var(--ink-dim);
}
.home-lead code { font-family: var(--mono); font-size: 0.9em; color: var(--accent-soft); }

.diagram {
  margin: 2.5rem auto 0; max-width: 48rem; padding: 1.6rem 1.4rem 0.85rem;
}
.diagram svg { display: block; width: 100%; height: auto; overflow: visible; }

/* Milled pockets — engraved recesses. The dark copy peeks out up-left, the
   light copy down-right, the sink-toned base sits on top (the same subtractive
   grammar as the engraved type; dual strokes, no SVG filters). */
.pocket .p-dark {
  stroke: light-dark(rgb(0 0 0 / 0.32), rgb(0 0 0 / 0.75));
  stroke-width: 1.6; transform: translate(-0.8px, -1.3px);
}
.pocket .p-lite {
  stroke: light-dark(rgb(255 255 255 / 0.85), rgb(255 255 255 / 0.09));
  stroke-width: 1.6; transform: translate(1px, 1.7px);
}
.pocket .p-base { fill: var(--sink); }

.title { fill: var(--ink); font: 600 17px var(--display); text-anchor: middle; }
.mono { font-family: var(--mono); text-anchor: middle; }
.mid { fill: var(--ink); font-size: 12px; font-weight: 600; }
.sub { fill: var(--ink-dim); font-size: 12px; }
.sub.dim { fill: var(--ink-faint); }
.tag { fill: var(--ink-faint); font-size: 10.5px; letter-spacing: 0.04em; }
.accent-tx { fill: var(--accent-soft); }

/* Engraved grooves — the neutral auth lanes, carved not drawn. */
.groove path { fill: none; stroke-linecap: round; }
.groove .g-dark {
  stroke: light-dark(rgb(0 0 0 / 0.28), rgb(0 0 0 / 0.7));
  stroke-width: 2; transform: translate(-0.6px, -1px);
}
.groove .g-lite {
  stroke: light-dark(rgb(255 255 255 / 0.8), rgb(255 255 255 / 0.08));
  stroke-width: 2; transform: translate(0.7px, 1.2px);
}
.groove .g-base { stroke: var(--sink); stroke-width: 2; }

.lane { stroke-width: 2; stroke-dasharray: 5 7; stroke-linecap: round; }
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
  .lane, .status .led { animation: none; }
}
</style>
