<script setup lang="ts">
import { computed } from 'vue'
import { api } from '#backend/api'

const { client, session } = useAuth()
const conn = useConvexConnectionState()
const isConnected = computed(() => conn.value.isWebSocketConnected)

const clearUserData = useMutation(api.demo.clearUserData)

async function resetData() {
  if (!confirm('Clear all your playground data (todos, chat, logs, counters)?')) return
  await clearUserData({})
  if (useRoute().path !== '/') {
    await navigateTo('/', { replace: true })
  }
  else {
    location.reload()
  }
}

const user = computed(() => session.value.data?.user)
const displayName = computed(() => {
  const u = user.value
  if (!u) return '?'
  return u.name ?? u.email ?? '?'
})
const initials = computed(() =>
  displayName.value.split(/[\s@]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join(''),
)

const groups = [
  { label: 'Overview', items: [
    { to: '/', label: 'Feature Gallery', exact: true },
    { to: '/showcase/dashboard', label: 'Mission Control', api: 'live composition', live: true },
  ] },
  {
    label: 'Authentication',
    items: [
      { to: '/login', label: 'Sign-in flow', api: 'useAuth + passkey/OTP' },
      { to: '/showcase/auth-state', label: 'Auth state & gates', api: 'useConvexAuth · Authenticated' },
    ],
  },
  {
    label: 'Queries & Live',
    items: [
      { to: '/todos', label: 'Todos (protected + SSR)', api: 'useQuery + preloadAuth' },
      { to: '/showcase/chat', label: 'Realtime chat', api: 'useQuery', live: true },
      { to: '/showcase/queries', label: 'Multi-query', api: 'useQueries' },
      { to: '/showcase/subscription', label: 'useSubscription bridge', api: 'useSubscription' },
    ],
  },
  {
    label: 'Mutations & Optimism',
    items: [
      { to: '/showcase/counter', label: 'Optimistic counter', api: 'withOptimisticUpdate', live: true },
    ],
  },
  {
    label: 'Pagination',
    items: [
      { to: '/showcase/logs', label: 'Paginated logs', api: 'usePaginatedQuery' },
      { to: '/showcase/optimistic-list', label: 'Optimistic paginated list', api: 'insertAtTop' },
      { to: '/showcase/experimental-paginated', label: 'Paginated (object form)', api: 'usePaginatedQuery_experimental', xp: true },
    ],
  },
  {
    label: 'Server & Actions',
    items: [
      { to: '/showcase/actions', label: 'useAction + controls', api: 'useAction' },
      { to: '/showcase/server-functions', label: 'Server functions (SSR)', api: 'fetchQuery · backendAuth' },
      { to: '/showcase/connection', label: 'Connection & metrics', api: 'useConvexConnectionState', live: true },
      { to: '/showcase/storage', label: 'File storage', api: 'useUpload · useStorageUrl', live: true },
    ],
  },
  {
    label: 'Experimental',
    items: [
      { to: '/showcase/experimental-query', label: 'Query (object form)', api: 'useQuery_experimental', xp: true },
    ],
  },
]

async function signOut() {
  await client.signOut()
  await navigateTo('/login')
}

const route = useRoute()
const isLogin = computed(() => route.path === '/login')
</script>

<template>
  <div class="shell">
    <!-- Modern top header bar -->
    <header class="topbar">
      <div class="topbar-inner">
        <div class="top-left">
          <NuxtLink
            to="/"
            class="logo"
          >
            <span class="logo-glyph">◳</span>
            <div class="logo-text">
              <span class="logo-name">nuxt-backend</span>
              <span class="logo-tag">playground</span>
            </div>
          </NuxtLink>
          <span class="sep" />
          <div class="top-status">
            <ClientOnly>
              <div
                class="conn-pill"
                :class="{ off: !isConnected }"
              >
                <SignalDot
                  :tone="isConnected ? 'ok' : 'err'"
                  :pulse="isConnected"
                />
                <span>{{ isConnected ? 'Convex live' : 'Offline' }}</span>
              </div>
            </ClientOnly>
          </div>
        </div>

        <div class="top-actions">
          <button
            type="button"
            class="reset-btn"
            title="Reset playground data"
            @click="resetData"
          >
            Reset data
          </button>

          <ClientOnly>
            <div
              v-if="user"
              class="user-chip"
            >
              <span class="avatar">{{ initials }}</span>
              <div class="user-meta">
                <span class="user-name">{{ user.name ?? user.email?.split('@')[0] }}</span>
              </div>
              <button
                type="button"
                class="signout-btn"
                title="Sign out"
                aria-label="Sign out"
                @click="signOut"
              >
                ⎋
              </button>
            </div>
          </ClientOnly>
        </div>
      </div>
    </header>

    <div class="main-grid">
      <!-- Refined left navigation rail -->
      <aside
        class="sidebar"
        :class="{ 'login-hidden': isLogin }"
      >
        <nav class="nav">
          <div
            v-for="group in groups"
            :key="group.label"
            class="nav-group"
          >
            <div class="nav-group-label">
              {{ group.label }}
            </div>
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="nav-link"
              :exact-active-class="('exact' in item && item.exact) ? 'active' : ''"
              :active-class="('exact' in item && item.exact) ? '' : 'active'"
            >
              <span class="nav-label">{{ item.label }}</span>
              <SignalDot
                v-if="'live' in item && item.live"
                tone="ok"
              />
              <span
                v-else-if="'xp' in item && item.xp"
                class="nav-xp"
              >XP</span>
            </NuxtLink>
          </div>
        </nav>

        <div class="sidebar-foot">
          <div class="foot-note">
            Demonstrates real-time queries, optimistic mutations, pagination, SSR preloads,
            Better Auth, protected routes &amp; the full nuxt-backend surface.
          </div>
        </div>
      </aside>

      <!-- Main content area -->
      <main class="content">
        <div class="content-inner fade-up">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

/* Top elegant bar */
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--panel) 96%, transparent);
  border-bottom: 1px solid var(--edge);
  backdrop-filter: saturate(1.1) blur(8px);
}
.topbar-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.55rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.top-left { display: flex; align-items: center; gap: 0.75rem; }
.logo {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  text-decoration: none;
  color: inherit;
}
.logo-glyph {
  font-size: 1.35rem;
  color: var(--accent);
  line-height: 1;
  filter: drop-shadow(0 1px 2px var(--accent-glow));
}
.logo-text { display: flex; flex-direction: column; line-height: 1.05; }
.logo-name { font-family: var(--mono); font-size: 0.88rem; font-weight: 700; letter-spacing: -.01em; color: var(--ink); }
.logo-tag { font-family: var(--mono); font-size: 0.58rem; font-weight: 600; letter-spacing: .18em; color: var(--ink-faint); text-transform: uppercase; }

.sep { width: 1px; height: 18px; background: var(--edge); }

.top-status { display: flex; align-items: center; }
.conn-pill {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-size: 0.72rem; font-weight: 600; letter-spacing: .04em;
  padding: 0.18rem 0.6rem; border-radius: 999px;
  background: var(--panel-2); border: 1px solid var(--edge);
  color: var(--ok);
}
.conn-pill.off { color: var(--err); }

.top-actions { display: flex; align-items: center; gap: 0.6rem; }

.reset-btn {
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: .06em;
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--edge);
  background: var(--panel);
  color: var(--ink-dim);
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition),
    background var(--transition), transform var(--press) var(--ease-out);
}
.reset-btn:hover { color: var(--warn); border-color: var(--warn); background: var(--warn-dim); }
.reset-btn:active { transform: scale(0.96); }

.user-chip {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.2rem 0.2rem 0.2rem 0.55rem;
  background: var(--panel-2);
  border: 1px solid var(--edge);
  border-radius: 999px;
}
.avatar {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 0.68rem; font-weight: 700; font-family: var(--mono);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.user-meta { display: flex; flex-direction: column; min-width: 0; }
.user-name { font-size: 0.78rem; font-weight: 600; line-height: 1; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.signout-btn {
  position: relative;
  width: 26px; height: 26px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-dim);
  font-size: 15px; line-height: 1;
  cursor: pointer;
  transition: color var(--transition), background var(--transition),
    border-color var(--transition), transform var(--press) var(--ease-out);
}
/* Extend the hit area to 40×40 without growing the visible chip. */
.signout-btn::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  width: 40px; height: 40px;
  transform: translate(-50%, -50%);
}
.signout-btn:hover { color: var(--err); background: var(--err-dim); border-color: var(--err); }
.signout-btn:active { transform: scale(0.92); }

/* Main grid: sidebar + content */
.main-grid {
  display: grid;
  grid-template-columns: 238px 1fr;
  flex: 1;
  min-height: 0;
}
/* responsive rules moved to global app.css for reliability across scoped styles */

.sidebar {
  border-right: 1px solid var(--edge);
  background: var(--panel-2);
  overflow-y: auto;
  padding: 0.9rem 0.6rem 1.25rem;
  display: flex;
  flex-direction: column;
}
.sidebar.login-hidden { display: none; }

.nav { flex: 1; display: flex; flex-direction: column; gap: 0.9rem; }
.nav-group { display: flex; flex-direction: column; }
.nav-group-label {
  font-family: var(--mono);
  font-size: 0.59rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--ink-faint);
  padding: 0.25rem 0.65rem 0.3rem;
}
.nav-link {
  display: flex; align-items: center; gap: 0.45rem;
  padding: 0.36rem 0.65rem;
  border-radius: var(--radius);
  color: var(--ink-dim);
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 500;
  border: 1px solid transparent;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
}
.nav-link:hover { background: var(--panel); color: var(--ink); }
.nav-link.active {
  background: var(--accent-dim);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
}
.nav-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-xp {
  font-family: var(--mono); font-size: 0.52rem; font-weight: 700;
  letter-spacing: .06em; color: var(--xp); background: var(--xp-dim);
  border-radius: 3px; padding: 0.04rem 0.26rem;
}

.sidebar-foot {
  margin-top: auto;
  padding-top: 0.9rem;
  border-top: 1px solid var(--edge);
}
.foot-note {
  font-size: 0.7rem;
  line-height: 1.35;
  color: var(--ink-faint);
  padding: 0 0.65rem;
}

/* Content */
.content {
  min-width: 0;
  padding: 1.75rem 2rem 2.75rem;
}
.content-inner {
  max-width: 1080px;
  margin: 0 auto;
}

@media (max-width: 860px) {
  .content { padding: 1.25rem 1rem 2rem; }
}
</style>
