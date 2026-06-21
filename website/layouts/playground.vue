<script setup lang="ts">
import { computed } from 'vue'
import { api } from '#backend/api'

const { client, session } = useAuth()
const conn = useConvexConnectionState()
const isConnected = computed(() => conn.value.isWebSocketConnected)

const clearUserData = useMutation(api.demo.clearUserData)

async function resetData() {
  if (!confirm('Clear all your playground data (todos, chat, logs, counters, files)?')) return
  await clearUserData({})
  if (useRoute().path !== '/playground') {
    await navigateTo('/playground', { replace: true })
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

type NavItem = { to: string, label: string, icon: string, api?: string, live?: boolean, xp?: boolean, exact?: boolean }
type NavGroup = { label: string, hint?: string, items: NavItem[] }

const groups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/playground', label: 'Mission Control', icon: 'overview', api: 'live composition', live: true, exact: true },
    ],
  },
  {
    label: 'Convex client',
    hint: 'The reactive Vue/Nuxt port',
    items: [
      { to: '/playground/convex/queries', label: 'Queries', icon: 'database', api: 'useQuery · useConvexQueries', live: true },
      { to: '/playground/convex/mutations', label: 'Mutations & actions', icon: 'mutate', api: 'useMutation · useAction', live: true },
      { to: '/playground/convex/pagination', label: 'Pagination', icon: 'pagination', api: 'usePaginatedQuery' },
      { to: '/playground/convex/search', label: 'Search & counts', icon: 'search', api: 'useSearch · useCount' },
      { to: '/playground/convex/storage', label: 'File storage', icon: 'storage', api: 'useUpload · useStorageUrl', live: true },
      { to: '/playground/convex/connection', label: 'Connection', icon: 'connection', api: 'useConvexConnectionState', live: true },
      { to: '/playground/convex/ssr', label: 'SSR & preload', icon: 'server', api: 'preloadQuery · backendAuth' },
      { to: '/playground/convex/subscription', label: 'Subscription bridge', icon: 'subscription', api: 'useSubscription' },
    ],
  },
  {
    label: 'Backend platform',
    hint: 'Auth · billing · email · more',
    items: [
      { to: '/playground/platform/account', label: 'Account & auth', icon: 'account', api: 'useAuth · Authenticated' },
      { to: '/playground/platform/billing', label: 'Billing', icon: 'billing', api: 'useBilling · CheckoutLink' },
      { to: '/playground/platform/features', label: 'Feature gates', icon: 'features', api: 'useFeatures' },
      { to: '/playground/platform/credits', label: 'Credits', icon: 'credits', api: 'useCredits', live: true },
      { to: '/playground/platform/email', label: 'Email', icon: 'email', api: 'useEmailStatus · Resend' },
      { to: '/playground/platform/workflows', label: 'Workflows', icon: 'workflows', api: 'useWorkflowStatus' },
      { to: '/playground/platform/rate-limit', label: 'Rate limiting', icon: 'shield', api: 'rateLimiter' },
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
  <div class="shell pg-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <div class="top-left">
          <NuxtLink
            to="/playground"
            class="logo"
          >
            <span class="logo-mark">
              <svg
                class="logo-glyph"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M12 4 19 8.5 12 13 5 8.5Z"
                  fill="#fff"
                />
                <path
                  d="M5 11.7 12 16 19 11.7"
                  stroke="#fff"
                  stroke-width="1.9"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                  opacity="0.78"
                />
                <path
                  d="M5 14.9 12 19.2 19 14.9"
                  stroke="#fff"
                  stroke-width="1.9"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                  opacity="0.5"
                />
              </svg>
            </span>
            <span class="logo-text">
              <span class="logo-name">Nuxt backend</span>
              <span class="logo-tag">playground</span>
            </span>
          </NuxtLink>

          <div class="top-status">
            <ClientOnly>
              <StatusRing
                :tone="isConnected ? 'ok' : 'err'"
                :pulse="isConnected"
                size="sm"
              >
                {{ isConnected ? 'Convex live' : 'Offline' }}
              </StatusRing>
              <template #fallback>
                <StatusRing
                  tone="muted"
                  size="sm"
                >
                  connecting…
                </StatusRing>
              </template>
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
            <Icon
              name="reset"
              :size="14"
            />
            Reset data
          </button>

          <ClientOnly>
            <div
              v-if="user"
              class="user-chip"
            >
              <span class="avatar">{{ initials }}</span>
              <span class="user-name">{{ user.name ?? user.email?.split('@')[0] }}</span>
              <button
                type="button"
                class="signout-btn"
                title="Sign out"
                aria-label="Sign out"
                @click="signOut"
              >
                <Icon
                  name="signout"
                  :size="14"
                />
              </button>
            </div>
            <NuxtLink
              v-else
              to="/login"
              class="signin-link"
            >
              Sign in
            </NuxtLink>
          </ClientOnly>
        </div>
      </div>
    </header>

    <div class="main-grid">
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
            <div class="nav-group-head">
              <span class="nav-group-label">{{ group.label }}</span>
              <span
                v-if="group.hint"
                class="nav-group-hint"
              >{{ group.hint }}</span>
            </div>
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="nav-link"
              :exact-active-class="item.exact ? 'active' : ''"
              :active-class="item.exact ? '' : 'active'"
            >
              <Icon
                :name="item.icon"
                :size="17"
                class="nav-icon"
              />
              <span class="nav-label">{{ item.label }}</span>
              <SignalDot
                v-if="item.live"
                tone="ok"
                :pulse="false"
              />
              <span
                v-else-if="item.xp"
                class="nav-xp"
              >XP</span>
            </NuxtLink>
          </div>
        </nav>

        <div class="sidebar-foot">
          <p class="foot-note">
            One package — Convex realtime client + Better&nbsp;Auth, Polar billing,
            Resend email, workflows &amp; rate limiting — sculpted in depth.
          </p>
        </div>
      </aside>

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
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: saturate(1.1) blur(10px);
}
.topbar-inner {
  max-width: 1320px;
  margin: 0 auto;
  padding: 0.6rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.top-left { display: flex; align-items: center; gap: 1rem; }
.logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  color: inherit;
}
.logo-mark {
  width: 30px; height: 30px;
  border-radius: 9px;
  background: var(--accent);
  box-shadow: var(--raise-accent);
  display: flex;
  align-items: center; justify-content: center;
  flex-shrink: 0;
}
.logo-glyph { width: 19px; height: 19px; }
.logo-text { display: flex; flex-direction: column; line-height: 1.05; }
.logo-name { font-family: var(--display); font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; color: var(--ink); }
.logo-tag { font-family: var(--mono); font-size: 0.58rem; font-weight: 600; letter-spacing: 0.16em; color: var(--ink-faint); text-transform: uppercase; }

.top-status { display: flex; align-items: center; }

.top-actions { display: flex; align-items: center; gap: 0.6rem; }

.reset-btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  padding: 0.38rem 0.7rem;
  border-radius: 999px;
  border: 0;
  background: var(--surface);
  color: var(--ink-dim);
  cursor: pointer;
  box-shadow: var(--raise-sm);
  transition: color var(--transition), box-shadow var(--transition), transform var(--press) var(--ease-out);
}
.reset-btn:hover { color: var(--warn); }
.reset-btn:active { box-shadow: var(--inset-sm); transform: translateY(0.5px); }

.user-chip {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.25rem 0.3rem 0.25rem 0.3rem;
  background: var(--surface);
  border-radius: 999px;
  box-shadow: var(--raise-sm);
}
.avatar {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 0.66rem; font-weight: 700; font-family: var(--mono);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: var(--raise-accent);
}
.user-name { font-size: 0.78rem; font-weight: 600; line-height: 1; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.signout-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border-radius: 999px;
  border: 0;
  background: var(--sink);
  color: var(--ink-dim);
  cursor: pointer;
  box-shadow: var(--inset-sm);
  transition: color var(--transition), transform var(--press) var(--ease-out);
}
.signout-btn:hover { color: var(--err); }
.signout-btn:active { transform: scale(0.92); }

.signin-link {
  font-size: 0.8rem; font-weight: 600;
  text-decoration: none;
  color: var(--on-accent);
  background: var(--accent);
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  box-shadow: var(--raise-accent);
}
.signin-link:hover { background: var(--accent-press); }

.main-grid {
  display: grid;
  grid-template-columns: 256px 1fr;
  flex: 1;
  min-height: 0;
}

.sidebar {
  overflow-y: auto;
  padding: 1rem 0.85rem 1.5rem;
  display: flex;
  flex-direction: column;
}
.sidebar.login-hidden { display: none; }

.nav { flex: 1; display: flex; flex-direction: column; gap: 1.15rem; }
.nav-group { display: flex; flex-direction: column; gap: 0.15rem; }
.nav-group-head { padding: 0.25rem 0.7rem 0.4rem; display: flex; flex-direction: column; gap: 0.1rem; }
.nav-group-label {
  font-family: var(--mono);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-dim);
}
.nav-group-hint {
  font-size: 0.66rem;
  color: var(--ink-faint);
}
.nav-link {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.5rem 0.7rem;
  border-radius: var(--r-sm);
  color: var(--ink-dim);
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 500;
  transition: color var(--transition), box-shadow var(--transition), background var(--transition);
}
.nav-icon { opacity: 0.85; }
.nav-link:hover { color: var(--ink); box-shadow: var(--raise-sm); background: var(--surface); }
/* Active = raised out of the material (the page you're on is "lifted"). */
.nav-link.active {
  color: var(--accent-soft);
  background: var(--surface);
  box-shadow: var(--raise);
  font-weight: 600;
}
.nav-link.active .nav-icon { color: var(--accent); opacity: 1; }
.nav-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-xp {
  font-family: var(--mono); font-size: 0.52rem; font-weight: 700;
  letter-spacing: 0.06em; color: var(--xp); background: var(--xp-dim);
  border-radius: 4px; padding: 0.06rem 0.3rem;
}

.sidebar-foot {
  margin-top: auto;
  padding: 1rem 0.7rem 0;
}
.foot-note {
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--ink-faint);
  margin: 0;
}

.content {
  min-width: 0;
  padding: 1.85rem 2.25rem 3rem;
}
.content-inner {
  max-width: 1120px;
  margin: 0 auto;
}

@media (max-width: 860px) {
  .content { padding: 1.25rem 1rem 2rem; }
  .logo-tag { display: none; }
}
</style>
