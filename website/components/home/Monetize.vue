<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * "Sell it three ways" — subscriptions, prepaid credits and metered AI calls,
 * three plaque tiles each carrying one real line of the package's API in a
 * milled slot.
 *
 * Below them the signature artifact: a static reserve → run → settle readout.
 * Three slot displays (balance / reserved / settled) step through ONE spend
 * when the section scrolls into view — a diagram, not a live query (the
 * homepage is prerendered and the visitor is anonymous), so the figures are
 * the playground catalog's own: a 200-credit monthly Pro grant and a 5-credit
 * call. SSR renders the finished (settled) state, so there is no layout shift
 * and hydration is stable; the client only replays it once, and never under
 * `prefers-reduced-motion`.
 *
 * Status language, unchanged from the rest of the site: amber while the
 * credits are reserved and the handler runs, green once the spend has settled.
 */

interface Way {
  kind: string
  icon: string
  title: string
  lines: string[]
  code: string
  experimental?: boolean
}

const WAYS: Way[] = [
  {
    kind: 'Recurring',
    icon: 'i-lucide-credit-card',
    title: 'Subscriptions',
    lines: [
      'Monthly or yearly plans, priced in cents, declared in `billing.catalog.ts` and pushed by one sync.',
      '`useBilling()` carries the whole lifecycle: checkout, customer portal, plan change, cancel.',
      'Plans grant feature benefits, and `useFeatures().has(\'premium\')` gates the UI on one.',
    ],
    code: 'const { subscription, checkout, portal, cancel } = useBilling()',
  },
  {
    kind: 'Prepaid',
    icon: 'i-lucide-coins',
    title: 'Prepaid credits',
    lines: [
      'A plan grants credits every cycle, a pack tops them up once — both are provider meter-credit benefits.',
      '`useCredits()` reads balance, credited and consumed off the webhook-synced cache inside the component.',
      'Buy a pack for someone else by email: the recipient claims it on first sign-in.',
    ],
    code: 'const { balance, topUp, gift } = useCredits(\'credits\')',
  },
  {
    kind: 'Per call',
    icon: 'i-lucide-sparkles',
    title: 'Metered AI',
    lines: [
      '`ai.meteredAction` rate-limits, reserves credits, runs your handler, then settles — a failed run charges nothing.',
      'Cost is a number or derived from the args; `charge: \'start\'` bills up front for work consumed upstream.',
      '`ai.stream` persists tokens server-side — reload mid-stream and it continues; an interrupted stream never settles.',
    ],
    code: 'ai.meteredAction({ meter: \'credits\', cost: 5, args, handler })',
    experimental: true,
  },
]

/** One spend, four beats. Figures: the playground's Pro grant, a 5-credit call. */
type Tone = 'idle' | 'busy' | 'done'

interface Beat {
  phase: string
  tone: Tone
  balance: number
  reserved: number
  settled: number
  note: string
}

const BEATS: Beat[] = [
  { phase: 'ready', tone: 'idle', balance: 200, reserved: 0, settled: 0, note: '// Pro grants 200 credits this cycle' },
  { phase: 'reserved', tone: 'busy', balance: 195, reserved: 5, settled: 0, note: 'reserveCredits({ meter: \'credits\', value: 5 })' },
  { phase: 'running', tone: 'busy', balance: 195, reserved: 5, settled: 0, note: 'handler runs — your model call' },
  { phase: 'settled', tone: 'done', balance: 195, reserved: 0, settled: 5, note: 'settleSpend(reservation) — usage event ingested' },
]

// Initial = the finished beat, so SSR and the first client render agree.
const step = ref(BEATS.length - 1)
const beat = () => BEATS[step.value] as Beat

const root = ref<HTMLElement | null>(null)
const timers: ReturnType<typeof setTimeout>[] = []
let observer: IntersectionObserver | undefined
let hasPlayed = false

const prefersReduced = () =>
  import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers.length = 0
}

function play() {
  clearTimers()
  step.value = 0
  const at = [700, 1500, 2300]
  at.forEach((ms, i) => {
    timers.push(setTimeout(() => {
      step.value = i + 1
    }, ms))
  })
}

onMounted(() => {
  if (prefersReduced()) return
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0]?.isIntersecting || hasPlayed) return
      hasPlayed = true
      play()
    },
    { threshold: 0.35 },
  )
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimers()
})

/** Split `a `code` b` into plain/code segments — inline code without v-html. */
function segments(md: string) {
  return md.split(/`([^`]+)`/).map((text, i) => ({ text, code: i % 2 === 1 }))
}
</script>

<template>
  <section class="sell">
    <div class="sell__inner">
      <header class="sell__head">
        <p class="eyebrow engraved-sm">
          Charge for it
        </p>
        <h2 class="sell__title engraved">
          Sell it three ways.
        </h2>
        <p class="sell__lead">
          One catalog file declares the plans, packs, meters and feature
          benefits; <code>nuxt-backend billing sync</code> pushes them to the
          provider. Granting stays provider-native — the module reads the
          balances back and spends against them.
        </p>
      </header>

      <ul class="sell__grid">
        <li
          v-for="way in WAYS"
          :key="way.title"
          class="way plaque"
        >
          <span class="way__top">
            <span class="way__well">
              <UIcon :name="way.icon" />
            </span>
            <span
              v-if="way.experimental"
              class="way__flag"
            >
              <span class="way__led" /> experimental
            </span>
          </span>

          <p class="way__kind engraved-sm">
            {{ way.kind }}
          </p>
          <h3 class="way__name embossed-sm">
            {{ way.title }}
          </h3>

          <ul class="way__lines">
            <li
              v-for="line in way.lines"
              :key="line"
            >
              <template
                v-for="(seg, i) in segments(line)"
                :key="i"
              >
                <code v-if="seg.code">{{ seg.text }}</code><template v-else>
                  {{ seg.text }}
                </template>
              </template>
            </li>
          </ul>

          <p class="way__code slot">
            <code>{{ way.code }}</code>
          </p>
        </li>
      </ul>

      <!-- The signature artifact: one spend, stepped through on scroll. -->
      <figure
        ref="root"
        class="rd"
      >
        <div class="rd__bezel plaque noise">
          <div class="rd__chrome">
            <span class="rd__ttl engraved-sm">Reserve → run → settle</span>
            <span
              class="rd__phase"
              :class="beat().tone"
            >
              <span class="rd__led" />
              {{ beat().phase }}
            </span>
          </div>

          <div
            class="rd__row"
            aria-hidden="true"
          >
            <div class="rd__disp slot">
              <span class="rd__label engraved-sm">balance</span>
              <span class="rd__val">{{ beat().balance }}</span>
            </div>
            <div class="rd__disp slot">
              <span class="rd__label engraved-sm">reserved</span>
              <span
                class="rd__val"
                :class="{ warn: beat().reserved > 0 }"
              >{{ beat().reserved }}</span>
            </div>
            <div class="rd__disp slot">
              <span class="rd__label engraved-sm">settled</span>
              <span
                class="rd__val"
                :class="{ ok: beat().settled > 0 }"
              >{{ beat().settled }}</span>
            </div>
          </div>

          <p
            class="rd__note"
            aria-hidden="true"
          >
            {{ beat().note }}
          </p>
        </div>

        <figcaption class="rd__caption">
          Diagram — one 5-credit call against a 200-credit monthly grant:
          <code>reserveCredits</code> atomically debits the cached balance to
          195, the handler runs, and <code>settleSpend</code> ingests the
          5-credit usage event. Two concurrent spends can never both pass, and
          an insufficient balance throws instead of going negative. If the
          handler fails — or a stream disconnects — <code>releaseSpend</code>
          undoes the reservation and no usage event is ever ingested.
        </figcaption>
      </figure>

      <div class="sell__links">
        <NuxtLink
          to="/platform/billing/credits-and-top-ups"
          class="hbtn sell__link"
        >
          <UIcon name="i-lucide-coins" />
          Credits &amp; top-ups
        </NuxtLink>
        <NuxtLink
          to="/platform/ai/metered-actions"
          class="hbtn sell__link"
        >
          <UIcon name="i-lucide-sparkles" />
          Metered actions
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sell { padding: clamp(3rem, 8vw, 7rem) 1.25rem; background: var(--bg); }
.sell__inner { max-width: 74rem; margin: 0 auto; }
.sell__head { max-width: 44rem; margin: 0 auto clamp(2rem, 5vw, 3rem); text-align: center; }

.eyebrow {
  margin: 0 0 1.2rem;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.sell__title {
  margin: 0; font-family: var(--display); font-weight: 600;
  font-size: clamp(1.9rem, 4.5vw, 3rem); letter-spacing: -0.005em; line-height: 1.1;
}
.sell__lead {
  margin: 1rem auto 0; max-width: 54ch;
  font-size: 1.04rem; line-height: 1.6; color: var(--ink-dim);
}
.sell__lead code { font-family: var(--mono); font-size: 0.88em; color: var(--ok-soft); }

/* ── Three tiles milled out of the slab ── */
.sell__grid {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: clamp(0.7rem, 1.6vw, 1.15rem);
}
@media (max-width: 900px) { .sell__grid { grid-template-columns: 1fr; } }

.way {
  display: flex; flex-direction: column; min-width: 0;
  padding: 1.35rem 1.3rem 1.4rem;
  transition: box-shadow var(--transition), transform var(--press);
}
.way:hover { transform: translateY(-2px); box-shadow: var(--plaque-hi); }

.way__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
/* Recessed icon well — carved into the tile face, the glyph raised out of it. */
.way__well {
  display: grid; place-items: center;
  width: 2.9rem; height: 2.9rem; border-radius: 0.9rem;
  background: var(--sink); box-shadow: var(--inset-1); color: var(--ink-dim);
}
.way__well :deep(svg) {
  width: 1.4rem; height: 1.4rem;
  /* Token, not inline filters: the prefers-contrast kill-switch zeroes it. */
  filter: var(--emboss-icon);
}
/* One signal in the row: amber marks the experimental tier (STABILITY.md).
   Crisp enamel on the plaque face — never engraved, never a panel fill. */
.way__flag {
  display: inline-flex; align-items: center; gap: 0.36rem;
  font-family: var(--mono); font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--warn);
}
.way__led { width: 6px; height: 6px; border-radius: 999px; background: currentColor; box-shadow: var(--glow-warn); }

.way__kind {
  margin: 0 0 0.3rem;
  font-family: var(--mono); font-size: 0.66rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.way__name {
  margin: 0 0 0.75rem; font-family: var(--display); font-size: 1.15rem;
  font-weight: 600; color: var(--ink); letter-spacing: 0.005em;
}

/* Each claim sits under its own machined seam. */
.way__lines { list-style: none; margin: 0; padding: 0; }
.way__lines li {
  padding: 0.6rem 0; border-top: 1px solid var(--edge);
  font-size: 0.9rem; line-height: 1.55; color: var(--ink-dim);
}
.way__lines li:first-child { border-top: 0; padding-top: 0; }
.way__lines code, .rd__caption code {
  font-family: var(--mono); font-size: 0.88em; color: var(--ok-soft);
}

/* The real line, milled into the tile face. */
.way__code {
  margin: 1.05rem 0 0; margin-top: auto; padding: 0.7rem 0.8rem;
  overflow-x: auto;
}
.way__code code {
  font-family: var(--mono); font-size: 0.71rem; line-height: 1.6;
  color: var(--ink); white-space: pre-wrap;
}

/* ── The readout: a plaque bezel holding three slot displays ── */
.rd { margin: clamp(1.8rem, 4vw, 2.6rem) auto 0; max-width: 46rem; }
.rd__bezel { padding: 0.95rem 1rem 1.05rem; }
.rd__chrome { display: flex; align-items: center; gap: 0.7rem; padding: 0.1rem 0.2rem 0.8rem; }
.rd__ttl {
  flex: 1;
  font-family: var(--mono); font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.rd__phase {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-family: var(--mono); font-size: 0.66rem; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-dim); transition: color 0.3s;
}
.rd__led { width: 7px; height: 7px; border-radius: 999px; background: currentColor; transition: box-shadow 0.3s; }
.rd__phase.busy { color: var(--warn); }
.rd__phase.busy .rd__led { box-shadow: var(--glow-warn); animation: beat 1.2s ease-in-out infinite; }
.rd__phase.done { color: var(--ok); }
.rd__phase.done .rd__led { box-shadow: var(--glow-ok); }

.rd__row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
.rd__disp {
  display: flex; flex-direction: column; gap: 0.3rem; min-width: 0;
  padding: 0.85rem 0.9rem 0.9rem;
}
.rd__label {
  font-family: var(--mono); font-size: 0.62rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.rd__val {
  font-family: var(--mono); font-size: clamp(1.4rem, 4vw, 1.7rem); font-weight: 600;
  font-variant-numeric: tabular-nums; color: var(--ink);
  transition: color 0.3s;
}
/* Signals stay crisp in the well — amber while held, green once charged. */
.rd__val.warn { color: var(--warn); }
.rd__val.ok { color: var(--ok); }

.rd__note {
  margin: 0.85rem 0.2rem 0;
  font-family: var(--mono); font-size: 0.72rem; line-height: 1.5;
  color: var(--ink-dim); min-height: 1.5em;
  overflow-x: auto; white-space: pre;
}
.rd__caption {
  margin: 0.95rem auto 0; max-width: 56ch;
  font-size: 0.86rem; line-height: 1.6; color: var(--ink-dim); text-align: center;
}

.sell__links { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.7rem; margin-top: 1.6rem; }
.sell__link { font-size: 0.88rem; padding: 0.6rem 1.05rem; }

/* Depth never carries a focus state — the ring sits on top of it. app.css's
   token ring is scoped to `.pg-shell`, which the homepage never matches, so
   without this the two doc links fell back to the UA's blue outline — the one
   colour design.md §7 bans. 2px `--focus` (the green), offset 2px, per §8. */
.sell__link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@keyframes beat { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) {
  .way { transition: none; }
  .way:hover { transform: none; }
  .rd__phase.busy .rd__led { animation: none; }
}
@media (max-width: 520px) {
  .rd__row { grid-template-columns: 1fr; }
}
</style>
