<script setup lang="ts">
/**
 * Closing call-to-action — a "launch console" that bookends the hero deck: a
 * beveled panel floating on an accent bloom, a chrome status bar, a gradient
 * headline, and an overlapping "scale" gauge crossing the top-right corner.
 */
</script>

<template>
  <section class="cta">
    <div class="cta__rig">
      <div class="cta__panel depth-border noise">
        <div class="cta__bloom" />
        <div class="cta__shine" />

        <header class="cta__bar">
          <span class="cta__lights"><i /><i /><i /></span>
          <span class="cta__name">launch · nuxt-backend</span>
        </header>

        <div class="cta__body">
          <p class="eyebrow">
            <span class="eyebrow__led" /> Ready in one command
          </p>
          <h2 class="cta__title">
            <span class="text-grad-ink">Install the module.</span>
            <span class="cta__title-accent">Run convex dev. Ship.</span>
          </h2>
          <p class="cta__lead">
            Add <code>nuxt-backend</code> to your modules, set two env vars, and the
            first run scaffolds the Convex files for you — real-time data and Better
            Auth, working.
          </p>
          <div class="cta__row">
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
              Explore the playground
            </NuxtLink>
          </div>
        </div>

        <!-- Overlapping "scale" gauge, echoing the hero deck -->
        <div class="cta__gauge">
          <span class="cta__gauge-ring">
            <span class="cta__gauge-val">0</span>
            <span class="cta__gauge-unit">servers</span>
          </span>
          <span class="cta__gauge-rows">
            <span class="cta__gauge-row"><span class="d ok" /> auto-scale</span>
            <span class="cta__gauge-row"><span class="d ok" /> edge</span>
            <span class="cta__gauge-row"><span class="d accent" /> realtime</span>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta { padding: clamp(2rem, 6vw, 5rem) 1.25rem clamp(4rem, 9vw, 7rem); background: var(--bg); }
.cta__rig { max-width: 56rem; margin: 0 auto; position: relative; padding-top: 1.5rem; }
.cta__panel {
  position: relative;
  overflow: visible;
  border-radius: var(--r-lg);
  box-shadow: var(--elev-4), 0 0 80px -28px var(--accent-glow);
}
/* keep the bloom/shine clipped to the rounded panel */
.cta__bloom, .cta__shine { border-radius: inherit; }
.cta__bloom {
  position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none;
  background: radial-gradient(34rem 20rem at 14% -12%,
    color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%);
}
.cta__shine {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(26rem 16rem at 80% -10%, rgb(255 255 255 / 0.07), transparent 60%);
}

.cta__bar {
  position: relative; z-index: 1;
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.7rem 1.1rem;
  border-bottom: 1px solid var(--edge);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  background: linear-gradient(180deg, var(--surface-hi), transparent);
}
.cta__lights { display: inline-flex; gap: 6px; }
.cta__lights i { width: 9px; height: 9px; border-radius: 999px; background: var(--sink); box-shadow: var(--inset-1); }
.cta__name { flex: 1; font-family: var(--mono); font-size: 0.72rem; color: var(--ink-faint); }

.cta__body {
  position: relative; z-index: 1;
  padding: clamp(2rem, 4.5vw, 3.25rem);
  text-align: center;
}
.eyebrow {
  display: inline-flex; align-items: center; gap: 0.55rem;
  margin: 0 0 1.1rem; padding: 0.4rem 0.9rem 0.4rem 0.72rem; border-radius: 999px;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600; color: var(--ink-dim);
  background: var(--grad-surface); box-shadow: var(--elev-1);
}
.eyebrow__led { width: 7px; height: 7px; border-radius: 999px; background: var(--accent); box-shadow: var(--glow-accent-soft); }

.cta__title {
  margin: 0; font-family: var(--display); font-weight: 700;
  font-size: clamp(1.85rem, 4.5vw, 2.9rem); letter-spacing: -0.025em; line-height: 1.08;
}
.cta__title span { display: block; }
.cta__title-accent {
  background: linear-gradient(135deg, var(--accent-soft), var(--accent) 45%, var(--accent-press));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.cta__lead {
  margin: 1.1rem auto 0; max-width: 36rem;
  font-size: 1.02rem; line-height: 1.6; color: var(--ink-dim);
}
.cta__lead code { font-family: var(--mono); font-size: 0.9em; color: var(--accent-soft); }

.cta__row { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.7rem; margin-top: 1.8rem; }
.hbtn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.72rem 1.25rem; border-radius: 999px;
  font-family: var(--display); font-size: 0.95rem; font-weight: 600;
  color: var(--ink); background: var(--grad-surface);
  box-shadow: var(--elev-1); text-decoration: none;
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

/* Overlapping gauge */
.cta__gauge {
  position: absolute;
  top: -1.1rem;
  right: -0.6rem;
  z-index: 3;
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.55rem 0.85rem 0.55rem 0.6rem;
  border-radius: var(--r);
  background: var(--grad-surface);
  box-shadow: var(--elev-3), 0 0 26px -12px var(--accent-glow);
}
.cta__gauge-ring {
  display: grid; place-items: center;
  width: 2.9rem; height: 2.9rem; border-radius: 999px;
  background: radial-gradient(circle at 32% 28%, var(--surface-hi), var(--sink) 78%);
  box-shadow: var(--inset-1), 0 0 0 3px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 14px -2px var(--accent-glow);
}
.cta__gauge-val { font-family: var(--display); font-size: 1.1rem; font-weight: 700; color: var(--ink); line-height: 1; }
.cta__gauge-unit { font-family: var(--mono); font-size: 0.5rem; letter-spacing: 0.08em; color: var(--ink-faint); }
.cta__gauge-rows { display: flex; flex-direction: column; gap: 0.18rem; }
.cta__gauge-row {
  display: inline-flex; align-items: center; gap: 0.34rem;
  font-family: var(--mono); font-size: 0.62rem; color: var(--ink-dim);
}
.cta__gauge-row .d { width: 6px; height: 6px; border-radius: 999px; }
.cta__gauge-row .d.ok { background: var(--ok); box-shadow: var(--glow-ok); }
.cta__gauge-row .d.accent { background: var(--accent); box-shadow: var(--glow-accent-soft); }

@media (max-width: 560px) { .cta__gauge { display: none; } }
</style>
