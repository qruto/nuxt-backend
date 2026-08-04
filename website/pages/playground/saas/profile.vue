<script setup lang="ts">
import { computed, ref, watch } from 'vue'

definePageMeta({ middleware: 'auth' })

const { user, client, changeEmail, role } = useAuth()
const workspace = useOrganization()

const initials = computed(() =>
  (user.value?.name ?? user.value?.email ?? '?').split(/[\s@]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join(''))

// Display name — prefill once the session user arrives.
const name = ref('')
watch(user, (u) => {
  if (u && !name.value) name.value = u.name ?? ''
}, { immediate: true })

const msg = ref<{ text: string, ok: boolean } | null>(null)
const savingName = ref(false)
const changingEmail = ref(false)

async function saveName() {
  msg.value = null
  savingName.value = true
  try {
    unwrapAuth(await client.updateUser({ name: name.value.trim() }))
    msg.value = { text: 'Name updated.', ok: true }
  }
  catch (e) {
    msg.value = { text: e instanceof Error ? e.message : 'Failed', ok: false }
  }
  finally { savingName.value = false }
}

// Change email is a two-step confirmed flow: Better Auth first emails the
// CURRENT address for approval, then the NEW address for verification.
const newEmail = ref('')
const emailValid = computed(() => isDeliveredTestEmail(newEmail.value))

async function doChangeEmail() {
  msg.value = null
  changingEmail.value = true
  try {
    unwrapAuth(await changeEmail(normalizeTestEmail(newEmail.value), '/playground/saas/profile'))
    msg.value = { text: `Confirmation sent to ${user.value?.email} — approve it, then verify the new address.`, ok: true }
    newEmail.value = ''
  }
  catch (e) {
    msg.value = { text: e instanceof Error ? e.message : 'Failed', ok: false }
  }
  finally { changingEmail.value = false }
}

const readout = computed(() => ({
  id: user.value?.id,
  email: user.value?.email,
  emailVerified: user.value?.emailVerified,
  role: role.value,
  workspace: workspace.current.value?.name,
}))
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useAuth · updateUser · changeEmail"
      title="Profile"
    >
      Who you are across the platform. The email address is the account anchor —
      changing it is a two-step flow confirmed from both inboxes via Resend.
    </PageHeader>

    <LabPanel
      label="identity"
      title="Your account"
      tone="accent"
    >
      <!-- Session state differs between SSR (no session) and hydration (session
           already cached), so identity chrome renders client-only. -->
      <ClientOnly>
        <div class="who">
          <span class="avatar">{{ initials }}</span>
          <div class="who-meta">
            <span class="who-name">{{ user?.name ?? '—' }}</span>
            <span class="who-email mono">{{ user?.email }}</span>
          </div>
          <div class="who-pills">
            <StatusPill
              :tone="user?.emailVerified ? 'ok' : 'warn'"
              dot
            >
              {{ user?.emailVerified ? 'email verified' : 'email unverified' }}
            </StatusPill>
            <StatusPill tone="muted">
              role: {{ role || 'user' }}
            </StatusPill>
            <StatusPill tone="muted">
              {{ workspace.current.value?.name ?? '—' }}
            </StatusPill>
          </div>
        </div>
        <template #fallback>
          <StatusRing tone="muted">
            loading identity…
          </StatusRing>
        </template>
      </ClientOnly>

      <div
        class="grid-2"
        style="margin-top: 1.1rem"
      >
        <LabField
          label="display name"
          hint="shown across the workspace"
        >
          <div class="row">
            <input
              v-model="name"
              class="input"
              placeholder="Your name"
              autocomplete="off"
              spellcheck="false"
              style="flex: 1"
            >
            <LabButton
              variant="signal"
              :loading="savingName"
              :disabled="!name.trim() || name.trim() === user?.name"
              @click="saveName"
            >
              Save
            </LabButton>
          </div>
        </LabField>

        <LabField
          label="change email"
          :hint="TEST_EMAIL_HELP"
          :error="newEmail && !emailValid ? 'Use the delivered@resend.dev inbox (+label allowed).' : undefined"
        >
          <div class="row">
            <input
              v-model="newEmail"
              class="input"
              placeholder="delivered+new@resend.dev"
              autocomplete="off"
              spellcheck="false"
              style="flex: 1"
            >
            <LabButton
              variant="signal"
              :loading="changingEmail"
              :disabled="!emailValid"
              @click="doChangeEmail"
            >
              Change
            </LabButton>
          </div>
        </LabField>
      </div>

      <p
        v-if="msg"
        class="msg"
        :class="{ ok: msg.ok, err: !msg.ok }"
      >
        {{ msg.text }}
      </p>
    </LabPanel>

    <LabPanel
      label="session"
      title="Live identity readout"
      variant="well"
    >
      <ClientOnly>
        <StateReadout
          :value="readout"
          label="useAuth()"
          tone="accent"
        />
      </ClientOnly>
    </LabPanel>
  </div>
</template>

<style scoped>
.who { display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap; }
.avatar {
  width: 46px; height: 46px; border-radius: 12px; flex-shrink: 0;
  background: var(--accent); color: var(--on-accent); box-shadow: var(--raise-accent);
  display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; font-size: 0.95rem;
}
.who-meta { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.who-name { font-size: 1rem; font-weight: 600; }
.who-email { font-size: 0.78rem; color: var(--ink-dim); }
.who-pills { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; margin-left: auto; }

.msg { margin: 1rem 0 0; font-size: 0.8rem; }
.msg.ok { color: var(--ok); }
.msg.err { color: var(--err); }
</style>
