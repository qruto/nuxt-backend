<script setup lang="ts">
import { computed, ref } from 'vue'

definePageMeta({ middleware: 'auth' })

// Passwordless Better Auth: the user is also the billing customer.
const { user, changeEmail, deleteAccount, registerPasskey, signOut } = useAuth()
const auth = useConvexAuth()

const newEmail = ref('')
const accountMsg = ref<{ text: string, ok: boolean } | null>(null)
const busy = ref(false)

async function doChangeEmail() {
  accountMsg.value = null
  busy.value = true
  try {
    await changeEmail(newEmail.value.trim())
    accountMsg.value = { text: `Confirmation sent to ${user.value?.email}.`, ok: true }
    newEmail.value = ''
  }
  catch (e) {
    accountMsg.value = { text: e instanceof Error ? e.message : 'Failed', ok: false }
  }
  finally { busy.value = false }
}
async function doRegisterPasskey() {
  accountMsg.value = null
  try {
    await registerPasskey()
    accountMsg.value = { text: 'Passkey registered on this device.', ok: true }
  }
  catch (e) {
    accountMsg.value = { text: e instanceof Error ? e.message : 'Failed', ok: false }
  }
}
async function doDelete() {
  if (!confirm('Send an account-deletion confirmation email?')) return
  accountMsg.value = null
  try {
    await deleteAccount()
    accountMsg.value = { text: 'Deletion confirmation email sent.', ok: true }
  }
  catch (e) {
    accountMsg.value = { text: e instanceof Error ? e.message : 'Failed', ok: false }
  }
}

const state = computed(() => ({ isLoading: auth.isLoading, isAuthenticated: auth.isAuthenticated }))
const initials = computed(() =>
  (user.value?.name ?? user.value?.email ?? '?').split(/[\s@]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join(''))
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useAuth · useConvexAuth · Authenticated"
      title="Account & auth"
    >
      Better Auth, passwordless (passkey + email OTP). The signed-in user is the
      source of truth across the whole platform — change-email and delete-account
      are confirmed via Resend. The gate components render purely by auth state.
    </PageHeader>

    <LabPanel
      label="identity"
      title="Signed in"
      tone="accent"
    >
      <div class="who">
        <span class="avatar">{{ initials }}</span>
        <div class="who-meta">
          <span class="who-name">{{ user?.name ?? '—' }}</span>
          <span class="who-email mono">{{ user?.email }}</span>
        </div>
      </div>

      <div
        class="grid-2"
        style="margin-top: 1.1rem"
      >
        <LabField
          label="change email"
          hint="confirmed via Resend"
        >
          <div class="row">
            <input
              v-model="newEmail"
              class="input"
              placeholder="new@email.com"
              autocomplete="off"
              spellcheck="false"
              style="flex: 1"
            >
            <LabButton
              variant="signal"
              :loading="busy"
              :disabled="!newEmail.trim()"
              @click="doChangeEmail"
            >
              Change
            </LabButton>
          </div>
        </LabField>

        <LabField
          label="security"
          hint="passkey + account"
        >
          <div class="row">
            <LabButton
              variant="ghost"
              @click="doRegisterPasskey"
            >
              Register passkey
            </LabButton>
            <LabButton
              variant="ghost"
              @click="signOut"
            >
              Sign out
            </LabButton>
            <LabButton
              variant="danger"
              @click="doDelete"
            >
              Delete account
            </LabButton>
          </div>
        </LabField>
      </div>

      <p
        v-if="accountMsg"
        class="msg"
        :class="{ ok: accountMsg.ok, err: !accountMsg.ok }"
      >
        {{ accountMsg.text }}
      </p>
    </LabPanel>

    <ClientOnly>
      <div class="grid-2">
        <LabPanel
          label="reactive"
          title="useConvexAuth()"
        >
          <StateReadout
            :value="state"
            tone="accent"
            label="reactive flags"
          />
        </LabPanel>

        <LabPanel
          label="gates"
          title="Declarative components"
          variant="well"
        >
          <div class="gates">
            <div class="gate">
              <code class="gate-name">&lt;AuthLoading&gt;</code>
              <AuthLoading>
                <StatusRing tone="info">
                  checking session…
                </StatusRing>
              </AuthLoading>
              <Authenticated><span class="gate-off">hidden</span></Authenticated>
              <Unauthenticated><span class="gate-off">hidden</span></Unauthenticated>
            </div>
            <div class="gate">
              <code class="gate-name">&lt;Authenticated&gt;</code>
              <Authenticated>
                <StatusRing tone="ok">
                  slot is live
                </StatusRing>
              </Authenticated>
              <Unauthenticated><span class="gate-off">hidden</span></Unauthenticated>
              <AuthLoading><span class="gate-off">hidden</span></AuthLoading>
            </div>
            <div class="gate">
              <code class="gate-name">&lt;Unauthenticated&gt;</code>
              <Unauthenticated>
                <StatusRing tone="warn">
                  please sign in
                </StatusRing>
              </Unauthenticated>
              <Authenticated><span class="gate-off">hidden</span></Authenticated>
              <AuthLoading><span class="gate-off">hidden</span></AuthLoading>
            </div>
          </div>
        </LabPanel>
      </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
.who { display: flex; align-items: center; gap: 0.85rem; }
.avatar {
  width: 46px; height: 46px; border-radius: 12px; flex-shrink: 0;
  background: var(--accent); color: var(--on-accent); box-shadow: var(--raise-accent);
  display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; font-size: 0.95rem;
}
.who-meta { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.who-name { font-size: 1rem; font-weight: 600; }
.who-email { font-size: 0.78rem; color: var(--ink-dim); }

.msg { margin: 1rem 0 0; font-size: 0.8rem; }
.msg.ok { color: var(--ok); }
.msg.err { color: var(--err); }

.gates { display: flex; flex-direction: column; gap: 0.6rem; }
.gate { display: flex; align-items: center; gap: 0.85rem; padding: 0.55rem 0.7rem; border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--raise-sm); }
.gate-name { font-family: var(--mono); font-size: 0.74rem; color: var(--ink-dim); min-width: 11rem; }
.gate-off { font-family: var(--mono); font-size: 0.68rem; color: var(--ink-faint); font-style: italic; }
</style>
