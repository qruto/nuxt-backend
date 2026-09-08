<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Homepage "boot console" — one install brings a whole backend online.
 *
 * On scroll-into-view it types the install command, then boots each backend
 * module in sequence: most light up "ready", while integrations you haven't
 * wired yet stay honestly "idle" (a graceful no-op until configured). Replayable.
 * SSR renders the finished state, so there's no layout shift and hydration is
 * stable; the animation only resets + replays on the client.
 */
type Mode = 'ready' | 'idle'
type State = 'pending' | 'booting' | Mode

interface Module { id: string, desc: string, mode: Mode }

const MODULES: Module[] = [
  { id: 'auth', desc: 'Better Auth · same-origin proxy', mode: 'ready' },
  { id: 'data', desc: 'Real-time queries & mutations', mode: 'ready' },
  { id: 'storage', desc: 'File uploads & serving', mode: 'ready' },
  { id: 'ratelimit', desc: 'Token-bucket guards', mode: 'ready' },
  { id: 'workflows', desc: 'Durable multi-step jobs', mode: 'ready' },
  { id: 'migrations', desc: 'Online schema migrations', mode: 'ready' },
  { id: 'aggregates', desc: 'O(log n) counts & sums', mode: 'ready' },
  { id: 'search', desc: 'Full-text search indexes', mode: 'ready' },
  { id: 'billing', desc: 'Polar checkout · entitlements', mode: 'idle' },
  { id: 'email', desc: 'Resend transactional · webhooks', mode: 'idle' },
]

const COMMAND = '$ npx nuxi module add nuxt-backend'
const readyCount = MODULES.filter(m => m.mode === 'ready').length

// Initial = finished state, so SSR and first client render agree.
const cmd = ref(COMMAND)
const states = ref<State[]>(MODULES.map(m => m.mode))
const online = ref(true)

const root = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | undefined
const timers: ReturnType<typeof setTimeout>[] = []
let hasPlayed = false

const prefersReduced = () =>
  import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers.length = 0
}

function later(fn: () => void, ms: number) {
  timers.push(setTimeout(fn, ms))
}

function play() {
  clearTimers()
  cmd.value = ''
  online.value = false
  states.value = MODULES.map(() => 'pending')

  // 1. Type the install command.
  for (let i = 0; i <= COMMAND.length; i++) {
    later(() => {
      cmd.value = COMMAND.slice(0, i)
    }, i * 22)
  }
  const afterType = COMMAND.length * 22 + 360

  // 2. Boot each module: brief spinner, then its final state.
  MODULES.forEach((mod, i) => {
    const at = afterType + i * 150
    later(() => {
      states.value[i] = 'booting'
    }, at)
    later(() => {
      states.value[i] = mod.mode
    }, at + 230)
  })

  // 3. Backend online.
  later(() => {
    online.value = true
  }, afterType + MODULES.length * 150 + 320)
}

onMounted(() => {
  if (prefersReduced()) return
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0]?.isIntersecting || hasPlayed) return
      hasPlayed = true
      play()
    },
    { threshold: 0.3 },
  )
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimers()
})

function replay() {
  hasPlayed = true
  play()
}
</script>

<template>
  <section class="home-section alt">
    <div class="home-wrap">
      <p class="eyebrow engraved-sm">
        One install
      </p>
      <h2 class="home-title engraved">
        A whole backend, online in one command.
      </h2>
      <p class="home-lead">
        Auth, data, storage, billing, email, rate limiting, workflows, migrations,
        aggregates, search — mounted by a single call. Each is a graceful no-op
        until you configure it, so you turn things on as you grow.
      </p>

      <div
        ref="root"
        class="console plaque noise"
      >
        <header class="chrome">
          <span class="ttl engraved-sm">Boot sequence</span>
          <span
            class="state"
            :class="{ on: online }"
          >
            <span class="led" />
            {{ online ? 'backend online' : 'booting…' }}
          </span>
        </header>

        <div class="body slot">
          <p class="cmd">
            <span class="caret-line">{{ cmd }}<span
              v-if="!online"
              class="caret"
            /></span>
          </p>

          <ul class="rack">
            <li
              v-for="(mod, i) in MODULES"
              :key="mod.id"
              class="mod"
              :class="states[i]"
            >
              <span class="glyph">
                <UIcon
                  v-if="states[i] === 'ready'"
                  name="i-lucide-check"
                />
                <UIcon
                  v-else-if="states[i] === 'idle'"
                  name="i-lucide-minus"
                />
                <span
                  v-else-if="states[i] === 'booting'"
                  class="spinner"
                />
                <span
                  v-else
                  class="bullet"
                />
              </span>
              <span class="name">{{ mod.id }}</span>
              <span class="desc">{{ mod.desc }}</span>
              <span class="tag">{{
                states[i] === 'booting' ? 'starting' : states[i] === 'pending' ? '' : states[i]
              }}</span>
            </li>
          </ul>

          <p class="summary">
            <span class="arrow">▸</span>
            {{ readyCount }} services ready · {{ MODULES.length - readyCount }} idle until configured ·
            <span class="hl">0 servers to manage</span>
          </p>
        </div>
      </div>

      <button
        type="button"
        class="replay"
        @click="replay"
      >
        <UIcon name="i-lucide-rotate-ccw" /> Replay boot
      </button>
    </div>
  </section>
</template>

<style scoped>
.home-section { padding: clamp(3rem, 8vw, 6.5rem) 1.25rem; background: var(--bg); }
.home-wrap { margin: 0 auto; max-width: 50rem; text-align: center; }

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

/* ── Console — a plaque bezel holding a recessed slot display ── */
.console {
  margin: 2.5rem auto 0; max-width: 46rem; text-align: left;
  padding: 0.9rem 1rem 1rem;
}
.chrome {
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.15rem 0.15rem 0.75rem;
}
.ttl {
  flex: 1;
  font-family: var(--mono); font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.state {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-family: var(--mono); font-size: 0.66rem; font-weight: 600;
  color: var(--ink-faint); transition: color 0.3s;
}
.state.on { color: var(--accent-soft); }
.state .led { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
.state.on .led { background: var(--accent); box-shadow: var(--glow-accent-soft); }

.body { padding: 1.1rem 1.15rem 1.2rem; font-family: var(--mono); }
.cmd { margin: 0 0 0.9rem; font-size: 0.84rem; color: var(--ink); min-height: 1.2em; }
.caret {
  display: inline-block; width: 8px; height: 1.05em; margin-left: 2px;
  vertical-align: text-bottom; background: var(--accent); animation: blink 1s steps(1) infinite;
}

.rack { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.mod {
  display: grid; grid-template-columns: 1.4rem 6.5rem 1fr auto; align-items: center;
  gap: 0.6rem; padding: 0.34rem 0.2rem; font-size: 0.8rem;
  border-bottom: 1px dashed var(--edge); transition: opacity 0.3s, transform 0.3s;
}
.mod:last-child { border-bottom: 0; }
.mod.pending { opacity: 0.28; transform: translateY(1px); }
.glyph { display: inline-flex; justify-content: center; color: var(--ink-faint); }
.mod.ready .glyph { color: var(--ok); }
.mod.booting .glyph { color: var(--accent); }
.glyph :deep(svg) { width: 14px; height: 14px; }
.bullet { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.spinner {
  width: 12px; height: 12px; border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-top-color: var(--accent); animation: spin 0.7s linear infinite;
}
.name { color: var(--ink); font-weight: 600; }
.desc { color: var(--ink-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag { font-size: 0.64rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); }
.mod.ready .tag { color: var(--ok); }
.mod.booting .tag { color: var(--accent); }

.summary {
  margin: 1rem 0 0; padding-top: 0.8rem; border-top: 1px solid var(--edge);
  font-size: 0.74rem; color: var(--ink-dim);
}
.summary .arrow { color: var(--accent); }
.summary .hl { color: var(--ink); font-weight: 600; }

.replay {
  display: inline-flex; align-items: center; gap: 0.4rem; margin-top: 1.4rem;
  padding: 0.5rem 0.95rem; border-radius: 999px; border: 0; cursor: pointer;
  font-family: var(--display); font-size: 0.8rem; font-weight: 600; color: var(--ink-dim);
  background: var(--grad-surface); box-shadow: var(--elev-1);
  transition: color var(--transition), box-shadow var(--transition), transform var(--press);
}
.replay:hover { color: var(--accent-soft); box-shadow: var(--elev-2); transform: translateY(-1px); }
.replay:active { box-shadow: var(--inset-1); transform: translateY(0.5px); }
.replay :deep(svg) { width: 14px; height: 14px; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .spinner, .caret { animation: none; } }
@media (max-width: 560px) {
  .mod { grid-template-columns: 1.2rem 1fr auto; }
  .mod .desc { display: none; }
}
</style>
