<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { user, role, banned, hasRole, can } = useAuth()
const { role: workspaceRole } = useOrganization()

const bootstrapCommand = `npx convex run functions:setUserRole '{"email":"${'you@example.com'}","role":"admin"}'`
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
      label="server"
      title="Guarding Convex functions"
    >
      <pre class="cmd"><code>// convex/functions.ts (scaffolded)
export const { authed, org, admin, withRole } = createFunctions({ query, mutation, action }, authorization)

// anywhere in your backend
export const purgeLogs = admin.mutation({ … })          // app-wide admin
export const createProject = org.mutation({ … })        // ctx.organization, fresh membership
export const review = withRole('editor').query({ … })   // custom role tier</code></pre>
    </LabPanel>
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
</style>
