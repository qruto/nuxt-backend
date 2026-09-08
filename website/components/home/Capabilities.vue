<script setup lang="ts">
/**
 * "The module bay" — the package's surface area as a bento of machined modules
 * slotted into a recessed rack. Two hero modules (real-time + the bundled
 * backend components) span wide; the rest are single tiles. Every module is a
 * raised, beveled surface with a recessed icon well; on hover it lifts out of
 * the bay. Raised vs inset depth — not colour — carries the structure; the only
 * chroma is a status LED where a status is real: green "live" on the real-time
 * module (it is), amber "idle" on the bundled components (no-ops until wired).
 */
const modules = [
  {
    icon: 'i-lucide-zap',
    title: 'Real-time by default',
    body: '`useQuery`, `useMutation`, `useAction` and pagination over a live WebSocket client, with SSR-safe hydration.',
    span: 'wide' as const,
    status: 'live' as const,
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
    status: 'idle' as const,
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
        <p class="eyebrow engraved-sm">
          Everything in the box
        </p>
        <h2 class="bay__title engraved">
          More than a data layer.
        </h2>
        <p class="bay__lead">
          Client composables, SSR helpers, and a platform layer of backend
          components — everything the module mounts, nothing you wire by hand.
        </p>
      </header>

      <!-- The recessed bay holds the modules -->
      <div class="bay__rack noise">
        <ul class="bay__grid">
          <li
            v-for="m in modules"
            :key="m.title"
            class="mod plaque"
            :class="[m.span]"
          >
            <span class="mod__top">
              <span class="mod__well">
                <UIcon :name="m.icon" />
              </span>
              <span
                v-if="m.status"
                class="mod__status"
                :class="m.status"
              >
                <span class="mod__status-led" /> {{ m.status }}
              </span>
            </span>

            <h3 class="mod__name embossed-sm">
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

            <p
              v-if="m.chips"
              class="mod__list engraved-sm"
            >
              <template
                v-for="(c, i) in m.chips"
                :key="c.label"
              >
                <span
                  v-if="i"
                  class="mod__dot"
                  aria-hidden="true"
                >·</span>
                <span>{{ c.label }}</span>
              </template>
            </p>
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
  margin: 0 0 1.2rem;
  font-family: var(--mono); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
}

.bay__title {
  margin: 0; font-family: var(--display); font-weight: 600;
  font-size: clamp(1.9rem, 4.5vw, 3rem); letter-spacing: -0.005em; line-height: 1.1;
}
.bay__lead { margin: 1rem 0 0; font-size: 1.04rem; line-height: 1.6; color: var(--ink-dim); }
.bay__lead code, .mod__body code {
  font-family: var(--mono); font-size: 0.88em; color: var(--ok-soft);
}

/* The bay: a recessed rack the modules sit inside — a wide machined slot. */
.bay__rack {
  padding: clamp(0.85rem, 2vw, 1.35rem);
  border-radius: calc(var(--r-lg) + 6px);
  background: var(--sink);
  box-shadow: var(--slot);
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
  transform: translateY(-2px);
  box-shadow: var(--plaque-hi);
}

.mod__top {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 1rem;
}
/* Recessed icon well — carved into the module face; the glyph itself is
   embossed neutral ink (raised out of the recess, no accent). */
.mod__well {
  display: grid; place-items: center;
  width: 2.9rem; height: 2.9rem; border-radius: 0.9rem;
  background: var(--sink);
  box-shadow: var(--inset-1);
  color: var(--ink-dim);
}
.mod__well :deep(svg) {
  width: 1.4rem; height: 1.4rem;
  /* Token, not inline shadows: the prefers-contrast kill-switch sets it to
     `none` (app.css). */
  filter: var(--emboss-icon);
}
/* Status pill — one signal per module: green = live (the LED beats because
   the socket is real), amber = idle until configured (static). The tint sits
   behind the text; the text is the signal. */
.mod__status {
  display: inline-flex; align-items: center; gap: 0.36rem;
  padding: 0.2rem 0.55rem; border-radius: 999px;
  font-family: var(--mono); font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
}
.mod__status-led { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
.mod__status.live { color: var(--ok); background: var(--ok-dim); }
.mod__status.live .mod__status-led { box-shadow: var(--glow-ok); animation: beat 2s ease-in-out infinite; }
.mod__status.idle { color: var(--warn); background: var(--warn-dim); }
.mod__status.idle .mod__status-led { box-shadow: var(--glow-warn); }

.mod__name {
  margin: 0 0 0.45rem; font-family: var(--display); font-size: 1.12rem;
  font-weight: 600; color: var(--ink); letter-spacing: 0.005em;
  /* raised via `.embossed-sm` */
}
.mod__body { margin: 0; font-size: 0.92rem; line-height: 1.58; color: var(--ink-dim); }

/* The bundled components — engraved straight into the module face. */
.mod__list {
  display: flex; flex-wrap: wrap; column-gap: 0.55rem; row-gap: 0.25rem;
  margin: 1.1rem 0 0;
  font-family: var(--mono); font-size: 0.7rem; font-weight: 600;
  letter-spacing: 0.11em; text-transform: uppercase;
}
.mod__dot { user-select: none; }

@keyframes beat { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .mod__status-led { animation: none; } }
</style>
