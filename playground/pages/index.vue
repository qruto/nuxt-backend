<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { data: preloadedUser } = await useFetch('/api/me.preload', {
  key: 'me.preload',
})
const user = usePreloadedAuthQuery(preloadedUser.value!)

const features = [
  {
    to: '/todos',
    icon: '✓',
    label: 'query + mutation',
    title: 'Todos',
    desc: 'Preloaded with SSR, hydrated into a live subscription. Per-user isolation.',
    color: '#60a5fa',
    live: false,
  },
  {
    to: '/showcase/chat',
    icon: '◈',
    label: 'useQuery',
    title: 'Realtime chat',
    desc: 'Shared message stream. Open two windows and watch messages push instantly.',
    color: '#a78bfa',
    live: true,
  },
  {
    to: '/showcase/counter',
    icon: '⚡',
    label: 'withOptimisticUpdate',
    title: 'Optimistic mutations',
    desc: 'UI updates before the server responds. Toggle to compare the latency difference.',
    color: '#fbbf24',
    live: true,
  },
  {
    to: '/showcase/logs',
    icon: '≡',
    label: 'usePaginatedQuery',
    title: 'Paginated logs',
    desc: 'Infinite-scroll pagination. Seed hundreds of entries, filter by level.',
    color: '#34d399',
    live: false,
  },
  {
    to: '/showcase/actions',
    icon: '▶',
    label: 'useAction',
    title: 'Server actions',
    desc: 'Non-reactive server calls with configurable delay, error rate, and results.',
    color: '#f87171',
    live: false,
  },
  {
    to: '/showcase/connection',
    icon: '◉',
    label: 'useConvexConnectionState',
    title: 'Connection state',
    desc: 'Live WebSocket metrics, inflight counters, and a history of state transitions.',
    color: '#818cf8',
    live: true,
  },
]
</script>

<template>
  <div class="overview">
    <header class="hero">
      <p class="greeting">
        Welcome back{{ user?.name ? `, ${user.name}` : '' }}
      </p>
      <h1>Convex Visual Playground</h1>
      <p class="subtitle">
        Every primitive exposed by <code>nuxt-backend</code> — live, interactive, and wired to a real Convex deployment.
      </p>
    </header>

    <div class="grid">
      <NuxtLink
        v-for="f in features"
        :key="f.to"
        :to="f.to"
        class="card"
        :style="{ '--feature-color': f.color }"
      >
        <div class="card-top">
          <span
            class="card-icon"
            :style="{ color: f.color }"
          >{{ f.icon }}</span>
          <span
            v-if="f.live"
            class="live-badge"
          ><span class="live-dot" />live</span>
        </div>
        <code class="api-label">{{ f.label }}</code>
        <h3>{{ f.title }}</h3>
        <p>{{ f.desc }}</p>
        <span class="arrow">→</span>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.overview { max-width: 900px; }

/* Hero */
.hero { margin-bottom: 2rem; }
.greeting {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 0.5rem;
}
h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  letter-spacing: -0.02em;
}
.subtitle {
  color: var(--muted-color);
  font-size: 0.9rem;
  margin: 0;
  max-width: 540px;
}
code {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.85em;
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: var(--accent);
}

/* Grid */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

/* Card */
.card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.25rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-bg);
  text-decoration: none;
  color: var(--text-color);
  transition: border-color var(--transition), background var(--transition), transform var(--transition);
  position: relative;
  overflow: hidden;
}
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--feature-color, var(--accent));
  opacity: 0;
  transition: opacity var(--transition);
}
.card:hover {
  border-color: var(--border-hover);
  background: var(--card-hover);
  transform: translateY(-2px);
}
.card:hover::before { opacity: 1; }

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}
.card-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--success);
  background: rgba(52, 211, 153, 0.12);
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
}
.live-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--success);
  animation: pulse-dot 2s infinite;
}

.api-label {
  font-size: 0.68rem;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: var(--muted-color);
  background: transparent;
  border: none;
  padding: 0;
  letter-spacing: 0.02em;
}

.card h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}
.card p {
  font-size: 0.82rem;
  color: var(--muted-color);
  margin: 0;
  flex: 1;
  line-height: 1.5;
}
.arrow {
  align-self: flex-end;
  color: var(--muted-color);
  font-size: 1rem;
  margin-top: 0.5rem;
  transition: transform var(--transition), color var(--transition);
}
.card:hover .arrow {
  transform: translateX(3px);
  color: var(--text-color);
}
</style>
