<script setup lang="ts">
/**
 * "The module bay" — the package's surface area as a bento of machined modules
 * slotted into a recessed rack. Two hero modules (real-time + the bundled
 * backend components) span wide; the rest are single tiles. Every module is a
 * raised, beveled surface with a recessed icon well and a status LED; on hover
 * it lifts out of the bay and its well lights up. Raised vs inset depth — not
 * colour — carries the structure.
 */
const modules = [
  {
    icon: 'i-lucide-zap',
    title: 'Real-time by default',
    body: '`useQuery`, `useMutation`, `useAction` and pagination over a live WebSocket client, with SSR-safe hydration.',
    span: 'wide' as const,
    live: true,
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'Auth, preconfigured',
    body: 'Better Auth out of the box, a same-origin proxy, `useAuth()`, and an opt-in `auth` route middleware.',
  },
  {
    icon: 'i-lucide-server',
    title: 'SSR & server helpers',
    body: '`fetchQuery`, `preloadQuery` and `backendAuth(event)` for authenticated Nitro handlers.',
  },
  {
    icon: 'i-lucide-blocks',
    title: 'Batteries-included components',
    body: 'A whole platform layer, mounted by one call — each a graceful no-op until you configure it.',
    span: 'wide' as const,
    chips: [
      { icon: 'i-lucide-credit-card', label: 'Billing' },
      { icon: 'i-lucide-mail', label: 'Email' },
      { icon: 'i-lucide-gauge', label: 'Rate limit' },
      { icon: 'i-lucide-workflow', label: 'Workflows' },
      { icon: 'i-lucide-arrow-left-right', label: 'Migrations' },
      { icon: 'i-lucide-sigma', label: 'Aggregates' },
      { icon: 'i-lucide-search', label: 'Search' },
    ],
  },
  {
    icon: 'i-lucide-wand-2',
    title: 'Zero-config scaffold',
    body: 'First run writes the minimum Convex files to mount auth and register routes. Own them anytime.',
  },
  {
    icon: 'i-lucide-git-compare',
    title: 'React parity',
    body: 'A faithful Vue/Nuxt port of the official Convex + Better Auth React/Next integration.',
  },
]

// Split a tiny markdown string into plain/code segments so we can render inline
// `code` spans without v-html (no XSS surface).
function segments(md: string) {
  return md.split(/`([^`]+)`/).map((text, i) => ({ text, code: i % 2 === 1 }))
}
</script>

<template>
  <section class="bay">
    <div class="bay__inner">
      <header class="bay__head">
        <p class="eyebrow">
          <span class="eyebrow__led" /> Everything in the box
        </p>
        <h2 class="bay__title">
          <span class="text-grad-ink">More than a data layer.</span>
        </h2>
        <p class="bay__lead">
          Nuxt owns the UI, routing and the same-origin auth proxy. Convex owns
          data, real-time subscriptions and Better Auth persistence.
          <code>nuxt-backend</code> keeps them aligned — and ships nothing you
          wire by hand.
        </p>
      </header>

      <!-- The recessed bay holds the modules -->
      <div class="bay__rack noise">
        <ul class="bay__grid">
          <li
            v-for="m in modules"
            :key="m.title"
            class="mod depth-border"
            :class="[m.span]"
          >
            <span class="mod__top">
              <span class="mod__well">
                <UIcon :name="m.icon" />
              </span>
              <span
                v-if="m.live"
                class="mod__live"
              >
                <span class="mod__live-led" /> live
              </span>
            </span>

            <h3 class="mod__name">
              {{ m.title }}
            </h3>
            <p class="mod__body">
              <template
                v-for="(seg, i) in segments(m.body)"
                :key="i"
              >
                <code v-if="seg.code">{{ seg.text }}</code><template v-else>
                  {{ seg.text }}
                </template>
              </template>
            </p>

            <ul
              v-if="m.chips"
              class="mod__chips"
            >
              <li
                v-for="c in m.chips"
                :key="c.label"
                class="mod__chip"
              >
                <UIcon :name="c.icon" />
                {{ c.label }}
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bay { padding: clamp(3rem, 8vw, 7rem) 1.25rem; background: var(--bg); }
.bay__inner { max-width: 74rem; margin: 0 auto; }
.bay__head { max-width: 42rem; margin: 0 auto clamp(2rem, 5vw, 3rem); text-align: center; }

.eyebrow {
  display: inline-flex; align-items: center; gap: 0.55rem;
  margin: 0 0 1rem; padding: 0.4rem 0.9rem 0.4rem 0.72rem; border-radius: 999px;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600; color: var(--ink-dim);
  background: var(--grad-surface); box-shadow: var(--elev-1);
}
.eyebrow__led { width: 7px; height: 7px; border-radius: 999px; background: var(--accent); box-shadow: var(--glow-accent-soft); }

.bay__title {
  margin: 0; font-family: var(--display); font-weight: 700;
  font-size: clamp(1.9rem, 4.5vw, 3rem); letter-spacing: -0.025em; line-height: 1.05;
}
.bay__lead { margin: 1rem 0 0; font-size: 1.04rem; line-height: 1.6; color: var(--ink-dim); }
.bay__lead code, .mod__body code {
  font-family: var(--mono); font-size: 0.88em; color: var(--accent-soft);
}

/* The bay: a recessed rack the modules sit inside. */
.bay__rack {
  padding: clamp(0.85rem, 2vw, 1.35rem);
  border-radius: calc(var(--r-lg) + 6px);
  background: var(--sink);
  box-shadow: var(--inset-2);
}
.bay__grid {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: clamp(0.7rem, 1.5vw, 1.1rem);
}
@media (max-width: 880px) { .bay__grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .bay__grid { grid-template-columns: 1fr; } }

/* A machined module. */
.mod {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.35rem 1.3rem 1.4rem;
  grid-column: span 2; /* 2-up on tablet */
  transition: box-shadow var(--transition), transform var(--press);
}
@media (min-width: 881px) {
  .mod { grid-column: span 1; }
  .mod.wide { grid-column: span 2; }
}
@media (max-width: 520px) {
  .mod { grid-column: span 1; }
}
.mod:hover {
  transform: translateY(-4px);
  box-shadow: var(--elev-3), 0 0 30px -14px var(--accent-glow);
}

.mod__top {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 1rem;
}
/* Recessed icon well — carved into the module face. */
.mod__well {
  display: grid; place-items: center;
  width: 2.9rem; height: 2.9rem; border-radius: 0.9rem;
  background: var(--sink);
  box-shadow: var(--inset-1);
  color: var(--accent);
  transition: box-shadow var(--transition), color var(--transition);
}
.mod__well :deep(svg) { width: 1.4rem; height: 1.4rem; }
.mod:hover .mod__well {
  box-shadow: var(--inset-1), 0 0 0 1px var(--accent-dim), 0 0 16px -4px var(--accent-glow);
}
.mod__live {
  display: inline-flex; align-items: center; gap: 0.36rem;
  padding: 0.2rem 0.55rem; border-radius: 999px;
  font-family: var(--mono); font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--ok);
  background: var(--ok-dim);
}
.mod__live-led { width: 6px; height: 6px; border-radius: 999px; background: var(--ok); box-shadow: var(--glow-ok); animation: beat 2s ease-in-out infinite; }

.mod__name {
  margin: 0 0 0.45rem; font-family: var(--display); font-size: 1.12rem;
  font-weight: 600; color: var(--ink); letter-spacing: -0.01em;
}
.mod__body { margin: 0; font-size: 0.92rem; line-height: 1.58; color: var(--ink-dim); }

.mod__chips {
  list-style: none; margin: 1.1rem 0 0; padding: 0;
  display: flex; flex-wrap: wrap; gap: 0.45rem;
}
.mod__chip {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.36rem 0.7rem; border-radius: 999px;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600; color: var(--ink-dim);
  background: var(--grad-surface); box-shadow: var(--elev-1);
  transition: color var(--transition), box-shadow var(--transition), transform var(--press);
}
.mod__chip :deep(svg) { width: 0.9em; height: 0.9em; color: var(--ink-faint); transition: color var(--transition); }
.mod__chip:hover {
  color: var(--accent-soft); transform: translateY(-1px);
  box-shadow: var(--elev-2), var(--glow-accent-soft);
}
.mod__chip:hover :deep(svg) { color: var(--accent); }

@keyframes beat { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .mod__live-led { animation: none; } }
</style>
