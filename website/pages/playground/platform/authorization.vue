<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const { user, role, banned, hasRole, can, client } = useAuth()
const { role: workspaceRole } = useOrganization()

const bootstrapCommand = `npx convex run functions:setUserRole '{"email":"${'you@example.com'}","role":"admin"}'`

// --- Live server-side guards (backend/guards.ts) ----------------------------
// Each button calls a Convex function built with a different pre-authorized
// builder; denials are REAL server-side rejections, not UI gating.
const convex = useConvex()
const GUARDS = [
  { key: 'whoami', label: 'authed.query', fn: api.guards.whoami, hint: 'signed in, not banned' },
  { key: 'workspaceInfo', label: 'org.query', fn: api.guards.workspaceInfo, hint: 'fresh workspace membership' },
  { key: 'adminStat', label: 'admin.query', fn: api.guards.adminStat, hint: 'app-wide admin only' },
  { key: 'editorOnly', label: 'withRole(\'editor\')', fn: api.guards.editorOnly, hint: 'custom role tier' },
] as const

const guardResults = ref<Record<string, { ok: boolean, detail: string }>>({})
const guardPending = ref<string | null>(null)

async function callGuard(entry: (typeof GUARDS)[number]) {
  guardPending.value = entry.key
  try {
    const result = await convex.query(entry.fn as never, {})
    guardResults.value = { ...guardResults.value, [entry.key]: { ok: true, detail: JSON.stringify(result) } }
  }
  catch (e) {
    const message = e instanceof Error ? e.message.split('\n')[0]! : 'denied'
    guardResults.value = { ...guardResults.value, [entry.key]: { ok: false, detail: message } }
  }
  finally {
    guardPending.value = null
  }
}

// --- User administration (admin plugin) -------------------------------------
interface AdminUserRow { id: string, email: string, role?: string | null, banned?: boolean | null }
const adminUsers = ref<AdminUserRow[]>([])
const adminNotice = ref<string | null>(null)
const adminBusy = ref<string | null>(null)

async function loadUsers() {
  adminBusy.value = 'list'
  adminNotice.value = null
  try {
    const result = unwrapAuth<{ users: AdminUserRow[] }>(await (client as never as {
      admin: { listUsers: (args: { query: { limit: number } }) => Promise<unknown> }
    }).admin.listUsers({ query: { limit: 20 } }))
    adminUsers.value = result.users ?? []
  }
  catch (e) {
    adminNotice.value = e instanceof Error ? e.message : 'Failed'
  }
  finally {
    adminBusy.value = null
  }
}

async function setBanned(row: AdminUserRow, ban: boolean) {
  adminBusy.value = row.id
  adminNotice.value = null
  try {
    const adminClient = client as never as {
      admin: {
        banUser: (args: { userId: string, banReason?: string }) => Promise<unknown>
        unbanUser: (args: { userId: string }) => Promise<unknown>
      }
    }
    unwrapAuth(ban
      ? await adminClient.admin.banUser({ userId: row.id, banReason: 'playground demo' })
      : await adminClient.admin.unbanUser({ userId: row.id }))
    adminNotice.value = ban
      ? `${row.email} banned — their authed.* calls now reject server-side.`
      : `${row.email} unbanned.`
    await loadUsers()
  }
  catch (e) {
    adminNotice.value = e instanceof Error ? e.message : 'Failed'
  }
  finally {
    adminBusy.value = null
  }
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="RoleBoundary"
      title="Roles & permissions"
    >
      App-wide roles ride on identity claims — <code>useAuth()</code> exposes
      <code>role</code>, <code>hasRole()</code>, and statement checks with
      <code>can()</code>; <code>&lt;RoleBoundary&gt;</code> gates templates. On
      the Convex side, <code>authed / org / admin</code> builders and
      <code>requireRole</code> guard functions.
    </PageHeader>

    <div class="grid-2">
      <LabPanel
        label="identity"
        title="Your claims"
        tone="accent"
      >
        <dl class="claims">
          <div><dt>user</dt><dd>{{ user?.email ?? '—' }}</dd></div>
          <div><dt>app role</dt><dd><code>{{ role }}</code></dd></div>
          <div><dt>workspace role</dt><dd><code>{{ workspaceRole ?? '—' }}</code></dd></div>
          <div><dt>banned</dt><dd><code>{{ banned }}</code></dd></div>
          <div><dt>hasRole('admin')</dt><dd><code>{{ hasRole('admin') }}</code></dd></div>
          <div><dt>can({ user: ['ban'] })</dt><dd><code>{{ can({ user: ['ban'] }) }}</code></dd></div>
        </dl>
        <p class="hint">
          Role changes reach claims when the token refreshes (≤15&nbsp;min) — server
          checks can pass <code>{ fresh: true }</code> to read past that.
        </p>
      </LabPanel>

      <LabPanel
        label="gate"
        title="Admin-only surface"
      >
        <RoleBoundary role="admin">
          <StatusRing
            tone="ok"
            pulse
          >
            admin access granted
          </StatusRing>
          <p
            class="hint"
            style="margin-top: 0.85rem"
          >
            You see this because your role passes
            <code>&lt;RoleBoundary role="admin"&gt;</code>. The typed admin
            client is at <code>useAuth().client.admin</code> (list users, ban,
            impersonate…).
          </p>
          <template #fallback>
            <StatusRing tone="muted">
              admins only
            </StatusRing>
            <p
              class="hint"
              style="margin-top: 0.85rem"
            >
              Mint your first admin from the CLI (the mutation ships in the
              scaffolded <code>functions.ts</code>):
            </p>
            <pre class="cmd"><code>{{ bootstrapCommand }}</code></pre>
            <p class="hint">
              Then sign out and back in (or wait for the token refresh) so the
              new role lands in your claims.
            </p>
          </template>
          <template #placeholder>
            <p class="hint">
              checking access…
            </p>
          </template>
        </RoleBoundary>
      </LabPanel>
    </div>

    <LabPanel
      label="server · live"
      title="Guarded Convex functions"
      tone="accent"
    >
      <p class="hint">
        Four real functions from <code>backend/guards.ts</code>, one per
        builder — the denials below are server-side rejections, not UI gating.
      </p>
      <div
        v-for="entry in GUARDS"
        :key="entry.key"
        class="guard-row"
      >
        <LabButton
          size="sm"
          :loading="guardPending === entry.key"
          @click="callGuard(entry)"
        >
          {{ entry.label }}
        </LabButton>
        <span class="hint guard-hint">{{ entry.hint }}</span>
        <StatusPill
          v-if="guardResults[entry.key]"
          :tone="guardResults[entry.key]!.ok ? 'ok' : 'err'"
          dot
        >
          {{ guardResults[entry.key]!.ok ? 'allowed' : 'denied' }}
        </StatusPill>
        <span
          v-if="guardResults[entry.key]"
          class="mono guard-detail"
        >{{ guardResults[entry.key]!.detail }}</span>
      </div>
    </LabPanel>

    <RoleBoundary role="admin">
      <LabPanel
        label="admin plugin"
        title="User administration"
        variant="well"
      >
        <div class="row">
          <LabButton
            variant="ghost"
            size="sm"
            :loading="adminBusy === 'list'"
            @click="loadUsers"
          >
            Load users
          </LabButton>
          <span class="hint">
            <code>client.admin.listUsers / banUser / unbanUser</code> — a banned
            user's <code>authed.*</code> calls reject and
            <code>useAuth().banned</code> flips on their next claim refresh.
          </span>
        </div>
        <div
          v-for="row in adminUsers"
          :key="row.id"
          class="guard-row"
        >
          <span class="mono admin-email">{{ row.email }}</span>
          <StatusPill
            :tone="row.banned ? 'err' : 'ok'"
            dot
          >
            {{ row.banned ? 'banned' : (row.role ?? 'user') }}
          </StatusPill>
          <LabButton
            v-if="!row.banned"
            variant="danger"
            size="sm"
            :disabled="row.id === user?.id"
            :loading="adminBusy === row.id"
            @click="setBanned(row, true)"
          >
            Ban
          </LabButton>
          <LabButton
            v-else
            variant="ghost"
            size="sm"
            :loading="adminBusy === row.id"
            @click="setBanned(row, false)"
          >
            Unban
          </LabButton>
        </div>
        <p
          v-if="adminNotice"
          class="hint"
        >
          {{ adminNotice }}
        </p>
      </LabPanel>
    </RoleBoundary>
  </div>
</template>

<style scoped>
.claims { display: flex; flex-direction: column; gap: 0.45rem; margin: 0 0 0.9rem; }
.claims div { display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0.7rem; border-radius: var(--r-sm); background: var(--sink); box-shadow: var(--inset-sm); }
.claims dt { font-size: 0.78rem; color: var(--ink-dim); font-family: var(--mono); }
.claims dd { margin: 0; font-size: 0.82rem; }
.cmd {
  margin: 0.5rem 0; padding: 0.7rem 0.85rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  font-family: var(--mono); font-size: 0.72rem; line-height: 1.55;
  overflow-x: auto; white-space: pre;
}
.hint { color: var(--ink-dim); font-size: 0.82rem; line-height: 1.5; margin: 0; }

.guard-row { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.55rem; flex-wrap: wrap; }
.guard-hint { min-width: 11rem; }
.guard-detail { font-size: 0.68rem; color: var(--ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.admin-email { font-size: 0.78rem; flex: 1; }
</style>
