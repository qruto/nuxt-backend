<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
</script>

<template>
  <main>
    <nav>
      <NuxtLink to="/app">← Back</NuxtLink>
    </nav>
    <RoleBoundary role="admin">
      <section>
        <h2>Admin</h2>
        <p class="muted">
          Only app-wide admins see this (<code>&lt;RoleBoundary role="admin"&gt;</code>).
          Manage users with the typed client: <code>useAuth().client.admin.*</code>.
        </p>
      </section>
      <template #fallback>
        <section>
          <h2>Admins only</h2>
          <p class="muted">
            Mint your first admin, then sign out and back in:
            <code>npx convex run functions:setUserRole '{"email":"you@example.com","role":"admin"}'</code>
          </p>
        </section>
      </template>
    </RoleBoundary>
  </main>
</template>
