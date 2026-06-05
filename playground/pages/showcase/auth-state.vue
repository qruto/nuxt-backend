<script setup lang="ts">
import { computed, ref } from 'vue'

// No auth middleware here on purpose — this page must render in BOTH the
// authenticated and unauthenticated states to demo the gate components.

const auth = useConvexAuth()
const { client } = useAuth()

const state = computed(() => ({
  isLoading: auth.isLoading,
  isAuthenticated: auth.isAuthenticated,
}))

const gates = computed(() => [
  { name: '<AuthLoading>', tone: 'signal' as const, active: auth.isLoading },
  { name: '<Authenticated>', tone: 'ok' as const, active: !auth.isLoading && auth.isAuthenticated },
  { name: '<Unauthenticated>', tone: 'warn' as const, active: !auth.isLoading && !auth.isAuthenticated },
])

const busy = ref(false)
async function signOut() {
  busy.value = true
  try {
    await client.signOut()
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      tag="useConvexAuth · <Authenticated>"
      title="Auth state & gate components"
    >
      <code>useConvexAuth()</code> exposes reactive <code>isLoading</code> /
      <code>isAuthenticated</code> flags, and the
      <code>&lt;Authenticated&gt;</code>, <code>&lt;Unauthenticated&gt;</code>,
      <code>&lt;AuthLoading&gt;</code> components render their slot only in the
      matching state. Sign out below to watch them switch live.
    </PageHeader>

    <ClientOnly>
      <template #fallback>
        <LabPanel
          label="signal"
          title="useConvexAuth()"
        >
          <p class="boot">
            Resolving auth state…
          </p>
        </LabPanel>
      </template>

      <div class="grid">
        <LabPanel
          label="signal"
          title="useConvexAuth()"
          tone="signal"
        >
          <StateReadout
            :value="state"
            tone="signal"
            label="reactive flags"
          />
          <div class="act">
            <LabButton
              v-if="auth.isAuthenticated"
              variant="danger"
              size="sm"
              :loading="busy"
              @click="signOut"
            >
              Sign out (live)
            </LabButton>
            <NuxtLink
              v-else
              to="/login"
              class="relink"
            >
              → go to /login to sign back in
            </NuxtLink>
          </div>
        </LabPanel>

        <LabPanel
          label="gates"
          title="Declarative components"
        >
          <div class="gates">
            <div
              v-for="g in gates"
              :key="g.name"
              class="gate"
              :class="[g.tone, { active: g.active }]"
            >
              <div class="gate-head">
                <code class="gate-name">{{ g.name }}</code>
                <StatusPill :tone="g.active ? g.tone : 'muted'">
                  {{ g.active ? 'rendering' : 'hidden' }}
                </StatusPill>
              </div>

              <AuthLoading v-if="g.name === '<AuthLoading>'">
                <p class="gate-slot">
                  Checking the session…
                </p>
              </AuthLoading>
              <Authenticated v-else-if="g.name === '<Authenticated>'">
                <p class="gate-slot">
                  ✓ Signed in — this slot is live.
                </p>
              </Authenticated>
              <Unauthenticated v-else>
                <p class="gate-slot">
                  You are signed out — please log in.
                </p>
              </Unauthenticated>

              <p
                v-if="!g.active"
                class="gate-muted"
              >
                slot not rendered in current state
              </p>
            </div>
          </div>
        </LabPanel>
      </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
.boot { margin: 0; padding: 0.5rem; color: var(--ink-dim); font-size: 0.85rem; }
.grid {
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: 1rem;
  align-items: start;
}
.act { margin-top: 0.85rem; }
.relink { color: var(--ink-dim); font-size: 0.8rem; text-decoration: none; }
.relink:hover { color: var(--signal); }

.gates { display: flex; flex-direction: column; gap: 0.65rem; }
.gate {
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--panel);
  padding: 0.7rem 0.8rem;
  opacity: 0.6;
  transition: opacity var(--transition), border-color var(--transition);
}
.gate.active { opacity: 1; }
.gate.active.ok { border-color: color-mix(in srgb, var(--ok) 32%, var(--edge)); }
.gate.active.warn { border-color: color-mix(in srgb, var(--warn) 32%, var(--edge)); }
.gate.active.signal { border-color: color-mix(in srgb, var(--signal) 32%, var(--edge)); }
.gate-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.gate-name { font-family: var(--mono); font-size: 0.76rem; color: var(--ink); background: transparent; padding: 0; }
.gate-slot { margin: 0.55rem 0 0; font-size: 0.84rem; color: var(--ink); }
.gate-muted { margin: 0.4rem 0 0; font-size: 0.74rem; color: var(--ink-faint); font-style: italic; }

code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--signal);
  background: var(--signal-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}

@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
</style>
