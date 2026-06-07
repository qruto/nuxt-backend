<script setup lang="ts">
import { computed } from 'vue'

definePageMeta({ middleware: 'auth' })

const { data: preloadedUser } = await useFetch('/api/me.preload', { key: 'me.preload' })
const user = usePreloadedAuthQuery(preloadedUser.value!)

const conn = useConvexConnectionState()
const online = computed(() => conn.value.isWebSocketConnected)

/**
 * Comprehensive feature gallery — every major capability of the package
 * is represented with a live, interactive destination.
 */
const features = [
  {
    to: '/showcase/dashboard',
    glyph: '⊞',
    api: 'useConvexQueries + usePaginatedQuery + useMutation + connectionState',
    title: 'Mission Control',
    desc: 'The flagship: one screen holding many live subscriptions open at once — gauge, tasks, stream & activity, all reacting in real time.',
    tone: 'signal',
    live: true,
    highlight: 'Flagship',
  },
  {
    to: '/todos',
    glyph: '✓',
    api: 'useQuery + usePreloadedAuthQuery + auth middleware',
    title: 'Protected Todos + SSR',
    desc: 'Full-stack: auth-aware preload on the server, live subscription after hydration, per-user data.',
    tone: 'signal',
    highlight: 'SSR + Auth',
  },
  {
    to: '/showcase/chat',
    glyph: '◈',
    api: 'useQuery',
    title: 'Realtime Chat',
    desc: 'Multi-client live updates. Messages appear instantly across tabs via Convex subscriptions.',
    tone: 'signal',
    live: true,
    highlight: 'Live',
  },
  {
    to: '/showcase/counter',
    glyph: '⚡',
    api: 'useMutation + withOptimisticUpdate',
    title: 'Optimistic Counter',
    desc: 'Instant UI feedback. Local patch applied before server roundtrip, rolled back on conflict.',
    tone: 'signal',
    live: true,
    highlight: 'Optimistic',
  },
  {
    to: '/showcase/queries',
    glyph: '⋲',
    api: 'useQueries',
    title: 'Parallel Reactive Queries',
    desc: 'Subscribe to an object map of queries in a single composable with unified loading state.',
    tone: 'signal',
    highlight: 'useQueries',
  },
  {
    to: '/showcase/logs',
    glyph: '≣',
    api: 'usePaginatedQuery',
    title: 'Paginated Logs',
    desc: 'Cursor-based pagination with loadMore. Real infinite scroll over a growing table.',
    tone: 'ok',
    highlight: 'Pagination',
  },
  {
    to: '/showcase/optimistic-list',
    glyph: '↥',
    api: 'insertAtTop / insertAtPosition',
    title: 'Optimistic Paginated List',
    desc: 'Insert into paged results optimistically with automatic offset & cache reconciliation.',
    tone: 'ok',
    highlight: 'Optimistic',
  },
  {
    to: '/showcase/experimental-query',
    glyph: '◎',
    api: 'useQuery_experimental',
    title: 'Query (object form)',
    desc: 'Status / data / error object shape, throwOnError, and more ergonomic loading states.',
    tone: 'xp',
    xp: true,
    highlight: '1.39+',
  },
  {
    to: '/showcase/experimental-paginated',
    glyph: '◍',
    api: 'usePaginatedQuery_experimental',
    title: 'Paginated (object form)',
    desc: 'Reshaped pagination result: status, data, canLoadMore, error, loadMore.',
    tone: 'xp',
    xp: true,
    highlight: '1.39+',
  },
  {
    to: '/showcase/actions',
    glyph: '▶',
    api: 'useAction',
    title: 'Server Actions',
    desc: 'Fire-and-forget or request/response Convex actions. Simulate latency & errors.',
    tone: 'warn',
    highlight: 'Actions',
  },
  {
    to: '/showcase/server-functions',
    glyph: '⌗',
    api: 'backendAuth · fetchQuery · fetchMutation · fetchAction',
    title: 'Server Functions (Nuxt)',
    desc: 'Run Convex queries, mutations & actions from a Nitro route with the user’s token — plus non-auth usePreloadedQuery.',
    tone: 'warn',
    highlight: 'SSR',
  },
  {
    to: '/showcase/connection',
    glyph: '◉',
    api: 'useConvexConnectionState',
    title: 'Connection & Metrics',
    desc: 'Live WebSocket state, inflight count, and request statistics exposed to the UI.',
    tone: 'warn',
    live: true,
    highlight: 'System',
  },
  {
    to: '/showcase/subscription',
    glyph: '∿',
    api: 'useSubscription',
    title: 'Generic Subscription Bridge',
    desc: 'Wrap any external reactive source (getCurrentValue + subscribe) as a Convex-like query.',
    tone: 'warn',
    highlight: 'Bridge',
  },
  {
    to: '/showcase/auth-state',
    glyph: '⚿',
    api: 'useConvexAuth + <Authenticated> helpers',
    title: 'Auth Primitives',
    desc: 'Reactive flags, loading states, and declarative <Authenticated> / <Unauthenticated> / <AuthLoading> components.',
    tone: 'signal',
    highlight: 'Auth',
  },
]
</script>

<template>
  <div class="overview">
    <header class="hero">
      <div class="hero-specs">
        <span class="spec">{{ features.length }} CAPABILITIES</span>
        <span class="spec">Convex + Nuxt</span>
        <span class="spec">SSR + Hydration</span>
        <span class="spec">Better Auth</span>
        <ClientOnly>
          <span
            class="spec live"
            :class="{ off: !online }"
          >
            <SignalDot
              :tone="online ? 'ok' : 'err'"
              :pulse="online"
            />
            {{ online ? 'LIVE LINK' : 'OFFLINE' }}
          </span>
        </ClientOnly>
      </div>

      <p class="greeting">
        Welcome, {{ user?.name || 'Operator' }} — session active
      </p>

      <h1>nuxt-backend <em>Playground</em></h1>
      <p class="subtitle">
        A living demonstration of <strong>every</strong> public API surface:
        real-time queries &amp; pagination, optimistic mutations, server actions,
        SSR preloading with auth, Better Auth flows, connection state, subscription bridging,
        and the experimental object-form composables — all backed by a real local Convex deployment.
      </p>

      <div class="hero-ctas">
        <NuxtLink
          to="/showcase/dashboard"
          class="btn primary"
        >Open Mission Control</NuxtLink>
        <NuxtLink
          to="/showcase/chat"
          class="btn"
        >Try realtime chat</NuxtLink>
      </div>

      <ClientOnly>
        <div
          class="scope-strip"
          :class="{ off: !online }"
        >
          <div class="scope-head">
            <span class="scope-tag">WS · SIGNAL TRACE</span>
            <span
              class="scope-stat"
              :class="online ? 'on' : 'off'"
            >
              <SignalDot
                :tone="online ? 'ok' : 'err'"
                :pulse="online"
              />
              {{ online ? 'LOCKED' : 'NO CARRIER' }}
            </span>
          </div>
          <Oscilloscope
            :live="online"
            :tone="online ? 'signal' : 'err'"
            :height="80"
            :speed="6"
          />
        </div>
        <template #fallback>
          <div class="scope-strip">
            <div class="scope-head">
              <span class="scope-tag">WS · SIGNAL TRACE</span>
            </div>
            <Oscilloscope
              :live="false"
              :height="80"
            />
          </div>
        </template>
      </ClientOnly>
    </header>

    <section class="gallery">
      <div class="gallery-head">
        <div class="lab-label">
          EXPLORE THE SURFACE
        </div>
        <h2>Interactive capabilities</h2>
      </div>

      <div class="grid stagger">
        <NuxtLink
          v-for="f in features"
          :key="f.to"
          :to="f.to"
          class="feat"
          :class="[f.tone, { xp: f.xp }]"
        >
          <div class="feat-head">
            <span class="feat-glyph">{{ f.glyph }}</span>
            <div class="feat-badges">
              <span
                v-if="f.live"
                class="feat-badge live"
              ><SignalDot tone="ok" /> LIVE</span>
              <span
                v-else-if="f.xp"
                class="feat-badge xp"
              >EXPERIMENTAL</span>
              <span
                v-if="f.highlight"
                class="feat-badge meta"
              >{{ f.highlight }}</span>
            </div>
          </div>

          <code class="feat-api">{{ f.api }}</code>
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>

          <span class="feat-go">Open demo →</span>
        </NuxtLink>
      </div>
    </section>

    <footer class="gallery-foot">
      <p>
        All data is scoped to your authenticated Convex identity. Use the <strong>Reset data</strong> button in the header to wipe your playground tables.
      </p>
    </footer>
  </div>
</template>

<style scoped>
.hero { margin-bottom: 1.75rem; }
.hero-specs {
  display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.85rem;
}
.spec {
  display: inline-flex; align-items: center; gap: 0.32rem;
  font-family: var(--mono); font-size: 0.61rem; font-weight: 600; letter-spacing: 0.1em;
  color: var(--ink-dim);
  border: 1px solid var(--edge); border-radius: 999px;
  padding: 0.15rem 0.52rem; background: var(--panel);
}
.spec.live { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 32%, transparent); }
.spec.live.off { color: var(--err); border-color: color-mix(in srgb, var(--err) 32%, transparent); }

.greeting {
  font-family: var(--mono); font-size: 0.68rem; font-weight: 600; letter-spacing: .1em;
  color: var(--accent); margin: 0 0 0.5rem; text-transform: uppercase;
}
h1 {
  font-family: var(--display);
  font-size: clamp(2.6rem, 6.2vw, 4rem);
  font-weight: 700; letter-spacing: -0.025em; line-height: 0.98; margin: 0 0 0.7rem;
  color: var(--ink);
}
h1 em {
  font-style: normal;
  color: var(--signal);
}
.subtitle { color: var(--ink-dim); font-size: 0.92rem; margin: 0 0 1.1rem; max-width: 70ch; line-height: 1.6; }
.subtitle strong { color: var(--ink); font-weight: 600; }

.hero-ctas { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1.4rem; }

/* Live oscilloscope strip — the WebSocket made visible. */
.scope-strip {
  border: 1px solid color-mix(in srgb, var(--signal) 22%, var(--edge));
  border-radius: var(--radius-lg);
  background:
    radial-gradient(120% 140% at 100% 0%, var(--signal-dim), transparent 60%),
    var(--panel);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.scope-strip.off { border-color: color-mix(in srgb, var(--err) 26%, var(--edge)); }
.scope-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--edge);
}
.scope-tag {
  font-family: var(--mono); font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-dim);
}
.scope-stat {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-family: var(--mono); font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.scope-stat.on { color: var(--ok); }
.scope-stat.off { color: var(--err); }

.gallery-head { margin-bottom: 0.7rem; }
.gallery-head h2 { margin: 0.1rem 0 0; font-size: 1.15rem; font-weight: 700; letter-spacing: -.015em; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(272px, 1fr));
  gap: 0.75rem;
}

.feat {
  position: relative;
  display: flex; flex-direction: column; gap: 0.32rem;
  padding: 1rem 1.05rem 1.05rem;
  border: 1px solid var(--edge);
  border-radius: var(--radius-lg);
  background: var(--panel);
  text-decoration: none;
  color: var(--ink);
  transition: transform var(--transition), border-color var(--transition), box-shadow var(--transition), background var(--transition);
}
.feat:hover {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--edge));
  box-shadow: var(--shadow);
  background: var(--panel-hi);
}
/* Lift only on hover-capable pointers; everyone gets a press response. */
@media (hover: hover) and (pointer: fine) {
  .feat:hover { transform: translateY(-2px); }
}
.feat:active { transform: scale(0.99); }

.feat-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.1rem; }
.feat-glyph { font-size: 1.35rem; line-height: 1; color: var(--accent); }

.feat-badges { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.feat-badge {
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-family: var(--mono); font-size: 0.56rem; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; padding: 0.1rem 0.38rem; border-radius: 999px;
}
.feat-badge.live { color: var(--ok); background: var(--ok-dim); }
.feat-badge.xp { color: var(--xp); background: var(--xp-dim); }
.feat-badge.meta { color: var(--ink-dim); background: var(--panel-2); border: 1px solid var(--edge); font-weight: 600; }

.feat-api {
  font-family: var(--mono); font-size: 0.63rem; font-weight: 600;
  color: var(--ink-faint); letter-spacing: .005em; background: transparent; padding: 0;
}
.feat h3 { font-size: 0.97rem; font-weight: 650; margin: 0.05rem 0 0.1rem; letter-spacing: -.01em; }
.feat p { font-size: 0.815rem; color: var(--ink-dim); margin: 0; flex: 1; line-height: 1.45; }
.feat-go {
  align-self: flex-end; margin-top: 0.25rem;
  font-size: 0.78rem; color: var(--ink-faint); transition: color var(--transition), transform var(--transition);
}
.feat:hover .feat-go { color: var(--accent); transform: translateX(1px); }

/* Tone accents via left border */
.feat::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: var(--accent); opacity: .0; transition: opacity var(--transition);
  border-top-left-radius: var(--radius-lg); border-bottom-left-radius: var(--radius-lg);
}
.feat:hover::before { opacity: .9; }
.feat.signal { --accent: var(--signal); }
.feat.ok { --accent: var(--ok); }
.feat.warn { --accent: var(--warn); }
.feat.xp { --accent: var(--xp); }

.gallery-foot {
  margin-top: 1.6rem;
  font-size: 0.8rem;
  color: var(--ink-dim);
  max-width: 68ch;
}
</style>
