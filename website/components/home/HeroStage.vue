<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

/**
 * The first screen — a depth-designed "control deck" running a LIVE
 * COLLABORATIVE session: who's online (presence), other people's cursors
 * drifting across the surface, and a streaming chat with typing indicators —
 * exactly the kind of multiplayer app you'd build on a real-time backend. The
 * window has macOS traffic-lights, tilts in perspective with the cursor, and
 * shows a genuinely live Convex connection chip. SSR-safe, reduced-motion aware.
 */

// ── People in the room ────────────────────────────────────────────
interface Person { who: string, initials: string, hue: number }
const people: Person[] = [
  { who: 'Ada', initials: 'AD', hue: 18 },
  { who: 'Sam', initials: 'SK', hue: 150 },
  { who: 'Mia', initials: 'MR', hue: 265 },
  { who: 'Leo', initials: 'JL', hue: 205 },
  { who: 'Eli', initials: 'EL', hue: 330 },
]

// ── Live chat (streaming, with typing indicators) ─────────────────
interface Line { who: string, hue: number, text: string }
interface Msg extends Line { id: number }

const CHAT: Line[] = [
  { who: 'Ada', hue: 18, text: 'shipping the new dashboard 🚀' },
  { who: 'Sam', hue: 150, text: 'auth + billing already wired' },
  { who: 'Mia', hue: 265, text: 'live cursors look great ✨' },
  { who: 'Leo', hue: 205, text: 'zero servers — love this' },
  { who: 'Eli', hue: 330, text: 'rebuilding the search index' },
  { who: 'Ada', hue: 18, text: 'everyone see my cursor?' },
]

let uid = 0
const chat = ref<Msg[]>([
  { ...CHAT[1]!, id: uid++ },
  { ...CHAT[2]!, id: uid++ },
])
const typing = ref<Line | null>(null)
const messagesToday = ref(3128)
let ci = 0

// ── Real Convex connection (client-only — no socket during prerender) ─
const conn = import.meta.client ? useConvexConnectionState() : null
const mounted = ref(false)
const connected = computed(() => mounted.value && !!conn?.value.isWebSocketConnected)

// ── Copy the install command ──────────────────────────────────────
const INSTALL = 'npx nuxi module add nuxt-backend'
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
async function copyInstall() {
  if (!import.meta.client || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(INSTALL)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 1600)
  }
  catch { /* clipboard blocked — no-op */ }
}

// ── Perspective parallax (cursor-driven tilt + glass shine) ───────
const stage = ref<HTMLElement | null>(null)
const tilt = reactive({ rx: 0, ry: 0, gx: 50, gy: 30 })
let raf = 0
let cycleTimer: ReturnType<typeof setTimeout> | undefined

const prefersReduced = () =>
  import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function onMove(e: MouseEvent) {
  if (!stage.value || prefersReduced()) return
  const r = stage.value.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width - 0.5
  const py = (e.clientY - r.top) / r.height - 0.5
  if (raf) return
  raf = window.requestAnimationFrame(() => {
    tilt.ry = px * 9
    tilt.rx = -py * 9
    tilt.gx = 50 + px * 44
    tilt.gy = 38 + py * 44
    raf = 0
  })
}
function onLeave() {
  tilt.rx = 0
  tilt.ry = 0
  tilt.gx = 50
  tilt.gy = 30
}

// Chat loop: someone types for a beat, then their message lands.
function cycle() {
  if (prefersReduced()) return
  const line = CHAT[ci % CHAT.length]!
  ci++
  typing.value = line
  cycleTimer = setTimeout(() => {
    typing.value = null
    chat.value = [...chat.value, { ...line, id: uid++ }].slice(-3)
    messagesToday.value += 1 + Math.floor(Math.random() * 3)
    cycleTimer = setTimeout(cycle, 1700)
  }, 1200)
}

onMounted(() => {
  mounted.value = true
  if (!prefersReduced()) cycleTimer = setTimeout(cycle, 1600)
})
onBeforeUnmount(() => {
  if (cycleTimer) clearTimeout(cycleTimer)
  if (copyTimer) clearTimeout(copyTimer)
  if (raf) cancelAnimationFrame(raf)
})

// ── Core feature set (shown as its own highlighted strip) ─────────
const core = [
  { id: 'auth', label: 'Auth', icon: 'i-lucide-shield-check' },
  { id: 'realtime', label: 'Real-time', icon: 'i-lucide-zap' },
  { id: 'billing', label: 'Billing', icon: 'i-lucide-credit-card' },
  { id: 'email', label: 'Email', icon: 'i-lucide-mail' },
  { id: 'workflows', label: 'Workflows', icon: 'i-lucide-workflow' },
  { id: 'search', label: 'Search', icon: 'i-lucide-search' },
  { id: 'ssr', label: 'SSR', icon: 'i-lucide-server' },
]
</script>

<template>
  <section
    ref="stage"
    class="hero noise"
    @mousemove="onMove"
    @mouseleave="onLeave"
  >
    <!-- Static atmosphere: a perspective floor + a faint warm wash (no cursor follow) -->
    <div class="hero__floor" />
    <div class="hero__wash" />
    <div class="hero__vignette" />

    <div class="hero__inner">
      <!-- ── Copy ───────────────────────────────────────────────── -->
      <div class="hero__copy">
        <p class="eyebrow">
          <span class="eyebrow__led" />
          Real-time Convex backend for Nuxt
        </p>

        <h1 class="hero__title">
          <span class="text-grad-ink">The backend your</span>
          <span class="hero__title-accent">Nuxt app was missing.</span>
        </h1>

        <p class="hero__lead">
          One package ships a Nuxt module and a Convex auth component with
          <strong>Better Auth</strong> built in — real-time data, SSR-safe auth,
          and batteries-included backend components, wired and ready.
        </p>

        <div class="hero__cta">
          <NuxtLink
            to="/getting-started/introduction"
            class="hbtn hbtn--primary"
          >
            <UIcon name="i-lucide-arrow-right" />
            Get started
          </NuxtLink>
          <NuxtLink
            to="/playground"
            class="hbtn"
          >
            <UIcon name="i-lucide-flask-conical" />
            Open the playground
          </NuxtLink>
          <a
            href="https://github.com/qruto/nuxt-backend"
            target="_blank"
            rel="noopener"
            class="hbtn hbtn--ghost"
          >
            <UIcon name="i-simple-icons-github" />
            GitHub
          </a>
        </div>

        <button
          type="button"
          class="install"
          :class="{ copied }"
          :aria-label="copied ? 'Copied install command' : 'Copy install command'"
          @click="copyInstall"
        >
          <span class="install__prompt">$</span>
          <code class="install__cmd">{{ INSTALL }}</code>
          <span class="install__copy">
            <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" />
          </span>
        </button>

        <p class="hero__proof">
          <span
            class="hero__proof-led"
            :class="{ on: connected }"
          />
          {{ connected ? 'This page is live on Convex' : 'Connecting to Convex…' }}
          <span class="hero__proof-sep">·</span>
          <span class="hero__proof-zero">0 servers to run</span>
        </p>
      </div>

      <!-- ── The instrument (a live collaborative window) ───────── -->
      <div class="hero__rig">
        <div
          class="deck depth-border"
          :style="{ '--rx': `${tilt.rx}deg`, '--ry': `${tilt.ry}deg` }"
        >
          <div
            class="deck__shine"
            :style="{ '--gx': `${tilt.gx}%`, '--gy': `${tilt.gy}%` }"
          />

          <!-- Chrome bar with macOS traffic-lights -->
          <header class="deck__bar">
            <span class="deck__lights">
              <i class="is-red" /><i class="is-amber" /><i class="is-green" />
            </span>
            <span class="deck__name">app · live · 5 collaborators</span>
            <span
              class="deck__conn"
              :class="{ on: connected }"
            ><span class="deck__conn-led" /> Convex</span>
          </header>

          <!-- Recessed collaborative display -->
          <div class="screen">
            <!-- drifting live cursors -->
            <span
              class="cursor cursor--mia"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 12 12"
                width="15"
                height="15"
              ><path d="M1 1 L1 9.2 L3.4 6.9 L5 10.2 L6.7 9.4 L5.1 6.1 L8.6 6 Z" /></svg>
              <span class="cursor__tag">Mia</span>
            </span>
            <span
              class="cursor cursor--leo"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 12 12"
                width="15"
                height="15"
              ><path d="M1 1 L1 9.2 L3.4 6.9 L5 10.2 L6.7 9.4 L5.1 6.1 L8.6 6 Z" /></svg>
              <span class="cursor__tag">Leo</span>
            </span>

            <div class="presence">
              <ul class="avatars">
                <li
                  v-for="p in people"
                  :key="p.initials"
                  class="avatar"
                  :style="{ '--hue': p.hue }"
                >
                  {{ p.initials }}
                </li>
                <li class="avatar avatar--more">
                  +7
                </li>
              </ul>
              <span class="presence__label"><span class="presence__led" /> 12 online</span>
            </div>

            <!-- live chat -->
            <span class="screen__title">TEAM CHAT</span>
            <TransitionGroup
              tag="ul"
              name="msg"
              class="chat"
            >
              <li
                v-for="m in chat"
                :key="m.id"
                class="msg"
              >
                <span
                  class="msg__av"
                  :style="{ '--hue': m.hue }"
                >{{ m.who.slice(0, 1) }}</span>
                <span class="msg__bubble">
                  <b>{{ m.who }}</b> {{ m.text }}
                </span>
              </li>
            </TransitionGroup>

            <div
              class="typing"
              :class="{ show: typing }"
            >
              <template v-if="typing">
                <span
                  class="typing__av"
                  :style="{ '--hue': typing.hue }"
                >{{ typing.who.slice(0, 1) }}</span>
                <span class="typing__dots"><i /><i /><i /></span>
                {{ typing.who }} is typing…
              </template>
            </div>
          </div>

          <footer class="deck__foot">
            <span class="deck__metric">{{ messagesToday.toLocaleString() }}</span>
            messages today
            <span class="deck__foot-sep">·</span>
            <span class="deck__edge">edge replicated</span>
          </footer>
        </div>

        <!-- Overlapping telemetry gauge (crosses the top-right corner) -->
        <div class="gauge">
          <span class="gauge__ring">
            <span class="gauge__val">99.9</span>
            <span class="gauge__unit">% uptime</span>
          </span>
          <span class="gauge__rows">
            <span class="gauge__row"><span class="gauge__dot ok" /> realtime</span>
            <span class="gauge__row"><span class="gauge__dot ok" /> auth</span>
            <span class="gauge__row"><span class="gauge__dot accent" /> billing</span>
          </span>
        </div>
      </div>
    </div>

    <!-- ── Core feature set — its own highlighted strip ──────────── -->
    <div class="core">
      <span class="core__label">
        <UIcon name="i-lucide-package-check" />
        Core feature set
      </span>
      <ul class="core__list">
        <li
          v-for="c in core"
          :key="c.id"
          class="core__item"
        >
          <span class="core__well">
            <UIcon :name="c.icon" />
          </span>
          {{ c.label }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  min-height: calc(100svh - var(--ui-header-height, 4rem));
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: clamp(2.25rem, 4.5vw, 3.75rem);
  padding: clamp(2.5rem, 5vw, 4rem) 1.25rem clamp(2.5rem, 5vw, 4rem);
  background: var(--bg);
  isolation: isolate;
}

/* ── Atmosphere (static — no cursor follow) ─────────────────────── */
.hero__floor {
  position: absolute;
  inset: 40% -20% -30%;
  z-index: -2;
  background-image:
    linear-gradient(var(--edge) 1px, transparent 1px),
    linear-gradient(90deg, var(--edge) 1px, transparent 1px);
  background-size: 46px 46px;
  transform: perspective(60rem) rotateX(60deg);
  transform-origin: bottom center;
  -webkit-mask-image: radial-gradient(120% 90% at 50% 0%, #000, transparent 72%);
  mask-image: radial-gradient(120% 90% at 50% 0%, #000, transparent 72%);
  opacity: 0.5;
}
.hero__wash {
  position: absolute;
  inset: 0;
  z-index: -3;
  pointer-events: none;
  background:
    radial-gradient(44rem 32rem at 88% 4%,
      color-mix(in srgb, var(--accent) 12%, transparent), transparent 58%),
    radial-gradient(40rem 30rem at 4% 0%,
      color-mix(in srgb, var(--accent) 7%, transparent), transparent 55%);
}
.hero__vignette {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(120% 80% at 50% 6%, transparent 60%,
    color-mix(in srgb, var(--bg), #000 6%) 100%);
}

.hero__inner {
  width: 100%;
  max-width: 78rem;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.02fr 0.98fr;
  align-items: center;
  gap: clamp(2rem, 5vw, 4.5rem);
}
@media (max-width: 980px) {
  .hero__inner { grid-template-columns: 1fr; gap: 3rem; }
}

/* ── Copy ───────────────────────────────────────────────────────── */
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 1.5rem;
  padding: 0.42rem 0.9rem 0.42rem 0.72rem;
  border-radius: 999px;
  font-family: var(--mono);
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--ink-dim);
  background: var(--grad-surface);
  box-shadow: var(--elev-1);
}
.eyebrow__led {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--ok);
  box-shadow: var(--glow-ok);
  animation: beat 2.2s ease-in-out infinite;
}
.hero__title {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(2.5rem, 6.2vw, 4.5rem);
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -0.035em;
  padding-bottom: 0.06em;
}
.hero__title span { display: block; padding-bottom: 0.06em; }
.hero__title-accent {
  background: linear-gradient(135deg,
    var(--accent-soft) 0%, var(--accent) 42%, var(--accent-press) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.hero__lead {
  margin: 1.5rem 0 0;
  max-width: 34rem;
  font-size: 1.08rem;
  line-height: 1.62;
  color: var(--ink-dim);
}
.hero__lead strong { color: var(--ink); font-weight: 600; }

.hero__cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin: 2.1rem 0 1.5rem;
}
.hbtn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.72rem 1.25rem;
  border-radius: 999px;
  font-family: var(--display);
  font-size: 0.96rem;
  font-weight: 600;
  color: var(--ink);
  background: var(--grad-surface);
  box-shadow: var(--elev-1);
  cursor: pointer;
  text-decoration: none;
  transition: box-shadow var(--transition), transform var(--press), color var(--transition);
}
.hbtn :deep(svg) { width: 1.05em; height: 1.05em; }
.hbtn:hover { box-shadow: var(--elev-2); transform: translateY(-1px); }
.hbtn:active { box-shadow: var(--inset-1); transform: translateY(0.5px); }
.hbtn--primary {
  color: var(--on-accent);
  background: linear-gradient(135deg, var(--accent), var(--accent-press));
  box-shadow: var(--elev-1), var(--glow-accent-soft);
}
.hbtn--primary:hover { box-shadow: var(--elev-2), var(--glow-accent); }
.hbtn--ghost { background: transparent; box-shadow: none; color: var(--ink-dim); }
.hbtn--ghost:hover { color: var(--ink); background: var(--surface); box-shadow: var(--elev-0); transform: none; }

/* Install command → a DARK recessed terminal channel (high contrast, copies on click) */
.install {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  width: fit-content;
  max-width: 100%;
  margin: 0;
  padding: 0.55rem 0.55rem 0.55rem 0.95rem;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, #2a2a2c, #161618);
  box-shadow:
    inset 0 2px 6px rgb(0 0 0 / 0.55),
    inset 0 0 0 1px rgb(255 255 255 / 0.06),
    0 1px 0 rgb(255 255 255 / 0.5);
  font-family: var(--mono);
  font-size: 0.85rem;
  color: #ededed;
  cursor: pointer;
  transition: box-shadow var(--transition);
}
.install:hover {
  box-shadow:
    inset 0 2px 6px rgb(0 0 0 / 0.55),
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent),
    0 1px 0 rgb(255 255 255 / 0.5);
}
.install__prompt { color: var(--accent); font-weight: 700; }
.install__cmd { color: #ededed; }
.install__copy {
  display: grid;
  place-items: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  background: linear-gradient(165deg, #3a3a3d, #242427);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.5), inset 1px 1px 0 rgb(255 255 255 / 0.1);
  color: #c7c7c7;
}
.install__copy :deep(svg) { width: 0.92rem; height: 0.92rem; }
.install.copied .install__copy { color: var(--ok); }

.hero__proof {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1.3rem 0 0;
  font-family: var(--mono);
  font-size: 0.74rem;
  color: var(--ink-faint);
}
.hero__proof-led {
  width: 7px; height: 7px; border-radius: 999px; background: var(--ink-faint);
  transition: background 0.3s, box-shadow 0.3s;
}
.hero__proof-led.on { background: var(--ok); box-shadow: var(--glow-ok); }
.hero__proof-sep { color: var(--edge-hi); }
.hero__proof-zero { color: var(--accent-soft); font-weight: 600; }

/* ── The instrument ─────────────────────────────────────────────── */
.hero__rig {
  position: relative;
  perspective: 1500px;
  padding: 1.5rem 1rem 1.5rem;
}
.deck {
  position: relative;
  border-radius: var(--r-lg);
  overflow: hidden;
  box-shadow:
    var(--elev-4),
    0 40px 80px -40px rgb(0 0 0 / 0.5),
    0 0 70px -18px var(--accent-glow);
  transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
  transform-style: preserve-3d;
  transition: transform 0.2s var(--ease-out), box-shadow var(--transition);
  will-change: transform;
}
.deck__shine {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  border-radius: inherit;
  background: radial-gradient(24rem 18rem at var(--gx, 30%) var(--gy, 18%),
    rgb(255 255 255 / 0.12), transparent 58%);
  transition: background 0.45s var(--ease-out);
}

.deck__bar {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.72rem 1rem;
  background: linear-gradient(180deg, var(--surface-hi), var(--surface));
  border-bottom: 1px solid var(--edge);
}
/* macOS traffic-lights */
.deck__lights { display: inline-flex; gap: 7px; }
.deck__lights i {
  width: 11px; height: 11px; border-radius: 999px;
  box-shadow: inset 0 0 0 0.5px rgb(0 0 0 / 0.18), inset 0 1px 0 rgb(255 255 255 / 0.4);
}
.deck__lights .is-red { background: radial-gradient(circle at 34% 30%, #ff7b72, #ff5f57); }
.deck__lights .is-amber { background: radial-gradient(circle at 34% 30%, #ffd479, #febc2e); }
.deck__lights .is-green { background: radial-gradient(circle at 34% 30%, #6fe88a, #28c840); }
.deck__name { flex: 1; font-family: var(--mono); font-size: 0.72rem; color: var(--ink-dim); }
.deck__conn {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-family: var(--mono); font-size: 0.66rem; font-weight: 600; color: var(--ink-faint);
}
.deck__conn-led { width: 7px; height: 7px; border-radius: 999px; background: var(--ink-faint); }
.deck__conn.on { color: var(--ok); }
.deck__conn.on .deck__conn-led { background: var(--ok); box-shadow: var(--glow-ok); animation: beat 2s ease-in-out infinite; }

/* Recessed collaborative display */
.screen {
  position: relative;
  overflow: hidden;
  margin: 0.85rem;
  padding: 0.95rem 1rem 1.05rem;
  border-radius: var(--r);
  background:
    repeating-linear-gradient(0deg, transparent 0 2px, rgb(0 0 0 / 0.012) 2px 3px),
    var(--sink);
  box-shadow: var(--inset-2);
}
.presence { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.avatars { list-style: none; display: flex; margin: 0; padding: 0; }
.avatar {
  width: 1.95rem; height: 1.95rem; margin-left: -0.55rem; border-radius: 999px;
  display: grid; place-items: center;
  font-family: var(--mono); font-size: 0.62rem; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, hsl(var(--hue) 78% 64%), hsl(var(--hue) 72% 46%));
  box-shadow: var(--elev-1), inset 1px 1px 0 rgb(255 255 255 / 0.4);
}
.avatar:first-child { margin-left: 0; }
.avatar--more { background: var(--grad-surface); color: var(--ink-dim); box-shadow: var(--elev-1); }
.presence__label {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-family: var(--mono); font-size: 0.7rem; color: var(--ink-dim);
}
.presence__led { width: 7px; height: 7px; border-radius: 999px; background: var(--ok); box-shadow: var(--glow-ok); }

.screen__title {
  display: block; margin: 1.05rem 0 0.55rem;
  font-family: var(--mono); font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.16em; color: var(--ink-faint);
}
.chat { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; min-height: 9.3rem; }
.msg { display: flex; align-items: center; gap: 0.55rem; }
.msg__av {
  flex: none; width: 1.55rem; height: 1.55rem; border-radius: 999px;
  display: grid; place-items: center;
  font-family: var(--mono); font-size: 0.6rem; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, hsl(var(--hue) 78% 64%), hsl(var(--hue) 72% 46%));
  box-shadow: var(--elev-1), inset 1px 1px 0 rgb(255 255 255 / 0.35);
}
.msg__bubble {
  flex: 1; min-width: 0;
  padding: 0.46rem 0.7rem; border-radius: 0.4rem 0.85rem 0.85rem 0.85rem;
  font-size: 0.8rem; color: var(--ink-dim);
  background: var(--grad-surface); box-shadow: var(--elev-1);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.msg__bubble b { color: var(--ink); font-weight: 600; }

.typing {
  display: flex; align-items: center; gap: 0.5rem;
  margin-top: 0.55rem; min-height: 1.55rem;
  font-family: var(--mono); font-size: 0.68rem; color: var(--ink-faint);
  opacity: 0; transition: opacity 0.25s var(--ease-out);
}
.typing.show { opacity: 1; }
.typing__av {
  flex: none; width: 1.35rem; height: 1.35rem; border-radius: 999px;
  display: grid; place-items: center;
  font-family: var(--mono); font-size: 0.55rem; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, hsl(var(--hue) 78% 64%), hsl(var(--hue) 72% 46%));
  box-shadow: var(--elev-1);
}
.typing__dots { display: inline-flex; gap: 3px; }
.typing__dots i {
  width: 5px; height: 5px; border-radius: 999px; background: var(--accent);
  animation: bounce 1.1s ease-in-out infinite;
}
.typing__dots i:nth-child(2) { animation-delay: 0.15s; }
.typing__dots i:nth-child(3) { animation-delay: 0.3s; }

/* Drifting live cursors */
.cursor {
  position: absolute;
  top: 0; left: 0;
  z-index: 4;
  display: inline-flex; align-items: flex-start; gap: 2px;
  pointer-events: none;
  will-change: transform;
}
.cursor svg { filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)); }
.cursor__tag {
  margin-top: 6px;
  padding: 0.1rem 0.4rem; border-radius: 0.4rem;
  font-family: var(--mono); font-size: 0.58rem; font-weight: 600; color: #fff;
  box-shadow: var(--elev-1);
}
.cursor--mia { animation: drift-mia 13s ease-in-out infinite; }
.cursor--mia svg { fill: hsl(265 72% 58%); }
.cursor--mia .cursor__tag { background: hsl(265 72% 52%); }
.cursor--leo { animation: drift-leo 16s ease-in-out infinite; }
.cursor--leo svg { fill: hsl(205 80% 52%); }
.cursor--leo .cursor__tag { background: hsl(205 80% 46%); }

.deck__foot {
  display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;
  padding: 0.2rem 1.1rem 1rem;
  font-family: var(--mono); font-size: 0.72rem; color: var(--ink-dim);
}
.deck__metric { color: var(--ink); font-weight: 700; }
.deck__foot-sep { color: var(--edge-hi); margin: 0 0.15rem; }
.deck__edge { color: var(--accent-soft); }

/* Chat stream transitions */
.msg-enter-active { transition: all 0.4s var(--ease-out); }
.msg-enter-from { opacity: 0; transform: translateY(8px) scale(0.98); }
.msg-leave-active { transition: all 0.3s var(--ease-out); position: absolute; }
.msg-leave-to { opacity: 0; transform: translateY(-6px); }
.msg-move { transition: transform 0.4s var(--ease-out); }

/* ── Overlapping telemetry gauge ────────────────────────────────── */
.gauge {
  position: absolute;
  top: 0.2rem;
  right: -0.4rem;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0.85rem 0.6rem 0.6rem;
  border-radius: var(--r);
  background: var(--grad-surface);
  box-shadow: var(--elev-3), 0 0 26px -12px var(--accent-glow);
  transform: translateZ(60px);
}
.gauge__ring {
  display: grid;
  place-items: center;
  width: 3.1rem; height: 3.1rem;
  border-radius: 999px;
  background: radial-gradient(circle at 32% 28%, var(--surface-hi), var(--sink) 78%);
  box-shadow:
    var(--inset-1),
    0 0 0 3px color-mix(in srgb, var(--accent) 55%, transparent),
    0 0 14px -2px var(--accent-glow);
}
.gauge__val { font-family: var(--display); font-size: 0.95rem; font-weight: 700; color: var(--ink); line-height: 1; }
.gauge__unit { font-family: var(--mono); font-size: 0.5rem; letter-spacing: 0.08em; color: var(--ink-faint); }
.gauge__rows { display: flex; flex-direction: column; gap: 0.2rem; }
.gauge__row {
  display: inline-flex; align-items: center; gap: 0.34rem;
  font-family: var(--mono); font-size: 0.62rem; color: var(--ink-dim);
}
.gauge__dot { width: 6px; height: 6px; border-radius: 999px; }
.gauge__dot.ok { background: var(--ok); box-shadow: var(--glow-ok); }
.gauge__dot.accent { background: var(--accent); box-shadow: var(--glow-accent-soft); }

/* ── Core feature set — its own highlighted strip ───────────────── */
.core {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 60rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: clamp(1.1rem, 2.5vw, 1.6rem) clamp(1rem, 3vw, 2rem);
  border-radius: var(--r-lg);
  background: var(--grad-surface);
  box-shadow: var(--elev-2);
}
.core__label {
  display: inline-flex; align-items: center; gap: 0.45rem;
  font-family: var(--mono); font-size: 0.66rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint);
}
.core__label :deep(svg) { width: 0.95rem; height: 0.95rem; color: var(--accent); }
.core__list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem;
}
.core__item {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.42rem 0.95rem 0.42rem 0.42rem;
  border-radius: 999px;
  font-family: var(--display); font-size: 0.9rem; font-weight: 600; color: var(--ink);
  background: var(--grad-surface);
  box-shadow: var(--elev-1);
  transition: box-shadow var(--transition), transform var(--press), color var(--transition);
}
.core__well {
  display: grid; place-items: center;
  width: 1.75rem; height: 1.75rem; border-radius: 999px;
  background: var(--accent-dim);
  box-shadow: var(--inset-1);
  color: var(--accent);
}
.core__well :deep(svg) { width: 0.95rem; height: 0.95rem; }
.core__item:hover {
  transform: translateY(-2px);
  box-shadow: var(--elev-2), var(--glow-accent-soft);
  color: var(--accent-soft);
}

@keyframes beat { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes bounce { 0%, 100% { transform: translateY(0); opacity: 0.5; } 50% { transform: translateY(-3px); opacity: 1; } }
@keyframes drift-mia {
  0%   { transform: translate(7.5rem, 1.5rem); }
  25%  { transform: translate(11rem, 5.5rem); }
  50%  { transform: translate(5rem, 8.5rem); }
  75%  { transform: translate(9rem, 4rem); }
  100% { transform: translate(7.5rem, 1.5rem); }
}
@keyframes drift-leo {
  0%   { transform: translate(2.5rem, 6.5rem); }
  30%  { transform: translate(6rem, 9.5rem); }
  55%  { transform: translate(12rem, 7rem); }
  80%  { transform: translate(8rem, 3rem); }
  100% { transform: translate(2.5rem, 6.5rem); }
}

@media (max-width: 540px) {
  .gauge { display: none; }
  .cursor { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .deck { transition: none; }
  .eyebrow__led, .deck__conn.on .deck__conn-led, .presence__led,
  .typing__dots i, .cursor { animation: none; }
  .cursor--mia { transform: translate(9rem, 2rem); }
  .cursor--leo { transform: translate(3rem, 7rem); }
  .msg-enter-active, .msg-leave-active, .msg-move { transition: none; }
}
</style>
