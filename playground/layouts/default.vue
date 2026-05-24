<script setup lang="ts">
const { client, session } = useAuth()
const conn = useConvexConnectionState()
const isConnected = computed(() => conn.value.isWebSocketConnected)

const user = computed(() => session.value.data?.user)

const initials = computed(() => {
  const name = user.value?.name ?? user.value?.email ?? '?'
  return name
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]!.toUpperCase())
    .join('')
})

const nav = [
  { to: '/',                  label: 'Overview',            tag: 'hub'   },
  { to: '/todos',             label: 'Todos',               tag: 'query' },
  { to: '/showcase/chat',     label: 'Realtime chat',       tag: 'live'  },
  { to: '/showcase/counter',  label: 'Optimistic mutations',tag: 'live'  },
  { to: '/showcase/logs',     label: 'Paginated logs',      tag: 'page'  },
  { to: '/showcase/actions',  label: 'Actions',             tag: 'action'},
  { to: '/showcase/connection', label: 'Connection state',  tag: 'live'  },
]

async function signOut() {
  await client.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="shell">
    <!-- ── Sidebar ───────────────────────────── -->
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-icon">⬡</span>
        <span class="brand-name">nuxt-backend</span>
      </div>

      <nav class="nav">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :exact="item.to === '/'"
          exact-active-class="active"
          :active-class="item.to === '/' ? '' : 'active'"
        >
          <span class="nav-label">{{ item.label }}</span>
          <span
            v-if="item.tag === 'live'"
            class="tag live"
          >live</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-footer">
        <div class="conn-row">
          <span :class="['conn-dot', { ok: isConnected }]" />
          <span class="conn-label">{{ isConnected ? 'Connected' : 'Connecting…' }}</span>
        </div>

        <div
          v-if="user"
          class="user-row"
        >
          <span class="avatar">{{ initials }}</span>
          <div class="user-info">
            <span class="user-name">{{ user.name ?? 'User' }}</span>
            <span class="user-email">{{ user.email }}</span>
          </div>
        </div>

        <button
          v-if="user"
          type="button"
          class="signout-btn"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </aside>

    <!-- ── Content ──────────────────────────── -->
    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
/* Layout shell */
.shell {
  display: grid;
  grid-template-columns: 230px 1fr;
  min-height: 100vh;
}

/* ── Sidebar ────────────────────────────────────────────── */
.sidebar {
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 1rem 1rem;
  border-bottom: 1px solid var(--border-color);
}
.brand-icon {
  font-size: 1.25rem;
  color: var(--accent);
  line-height: 1;
}
.brand-name {
  font-size: 0.8rem;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: var(--text-color);
  letter-spacing: 0.02em;
}

/* Nav */
.nav {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 0.625rem;
  flex: 1;
  gap: 1px;
}

.nav-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.75rem;
  border-radius: var(--radius);
  color: var(--muted-color);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 500;
  transition: background var(--transition), color var(--transition);
  gap: 0.5rem;
}
.nav-link:hover {
  background: var(--card-bg);
  color: var(--text-color);
}
.nav-link.active {
  background: var(--accent-dim);
  color: var(--accent);
}
.nav-label { flex: 1; }

/* Tags */
.tag {
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}
.tag.live {
  background: rgba(52, 211, 153, 0.15);
  color: var(--success);
}

/* Footer */
.sidebar-footer {
  padding: 0.75rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.conn-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.25rem;
}
.conn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--danger-color);
  flex-shrink: 0;
}
.conn-dot.ok {
  background: var(--success);
  animation: pulse-dot 2s infinite;
}
.conn-label {
  font-size: 0.75rem;
  color: var(--muted-color);
}

.user-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0 0.25rem;
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
}
.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.user-name {
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-email {
  font-size: 0.7rem;
  color: var(--muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.signout-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--muted-color);
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 500;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
  align-self: stretch;
}
.signout-btn:hover {
  background: var(--danger-dim);
  color: var(--danger-color);
  border-color: var(--danger-color);
}

/* ── Content ────────────────────────────────────────────── */
.content {
  padding: 2rem 2.5rem;
  min-width: 0;
}

/* ── Responsive ─────────────────────────────────────────── */
@media (max-width: 768px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
  .content { padding: 1.25rem; }
}
</style>
