<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({ middleware: 'auth' })

const { user, session, client, registerPasskey, deleteAccount, signOut } = useAuth()

const msg = ref<{ text: string, ok: boolean } | null>(null)

function fail(e: unknown) {
  msg.value = { text: e instanceof Error ? e.message : 'Failed', ok: false }
}

// --- Email verification -----------------------------------------------------
// OTP sign-in verifies the address automatically; only passkey-first accounts
// can be unverified. The endpoint throws for verified users, so gate the button.

const sendingVerify = ref(false)
async function sendVerification() {
  if (!user.value?.email) return
  msg.value = null
  sendingVerify.value = true
  try {
    unwrapAuth(await client.sendVerificationEmail({ email: user.value.email, callbackURL: '/playground/saas/security' }))
    msg.value = { text: `Verification email sent to ${user.value.email}.`, ok: true }
  }
  catch (e) {
    fail(e)
  }
  finally { sendingVerify.value = false }
}

// --- Passkeys ----------------------------------------------------------------

interface PasskeyRow { id: string, name?: string | null, createdAt: string | Date, deviceType?: string }
const passkeys = ref<PasskeyRow[]>([])
const passkeysLoaded = ref(false)

async function loadPasskeys() {
  passkeys.value = unwrapAuth<PasskeyRow[]>(await client.passkey.listUserPasskeys()) ?? []
  passkeysLoaded.value = true
}
onMounted(loadPasskeys)

const addingPasskey = ref(false)
async function addPasskey() {
  msg.value = null
  addingPasskey.value = true
  try {
    unwrapAuth(await registerPasskey())
    msg.value = { text: 'Passkey registered on this device.', ok: true }
    await loadPasskeys()
  }
  catch (e) {
    fail(e)
  }
  finally { addingPasskey.value = false }
}

async function renamePasskey(row: PasskeyRow) {
  const name = prompt('Passkey name', row.name ?? '')?.trim()
  if (!name) return
  msg.value = null
  try {
    unwrapAuth(await client.passkey.updatePasskey({ id: row.id, name }))
    await loadPasskeys()
  }
  catch (e) {
    fail(e)
  }
}

async function removePasskey(row: PasskeyRow) {
  if (!confirm(`Remove passkey “${row.name ?? row.id}”?`)) return
  msg.value = null
  try {
    unwrapAuth(await client.passkey.deletePasskey({ id: row.id }))
    await loadPasskeys()
  }
  catch (e) {
    fail(e)
  }
}

// --- Sessions ----------------------------------------------------------------

interface SessionRow { token: string, userAgent?: string | null, createdAt: string | Date, ipAddress?: string | null }
const sessions = ref<SessionRow[]>([])
const currentToken = computed(() => session.value.data?.session?.token)

async function loadSessions() {
  sessions.value = unwrapAuth<SessionRow[]>(await client.listSessions()) ?? []
}
onMounted(loadSessions)

async function revoke(row: SessionRow) {
  msg.value = null
  try {
    unwrapAuth(await client.revokeSession({ token: row.token }))
    await loadSessions()
  }
  catch (e) {
    fail(e)
  }
}

const revokingOthers = ref(false)
async function revokeOthers() {
  msg.value = null
  revokingOthers.value = true
  try {
    unwrapAuth(await client.revokeOtherSessions())
    msg.value = { text: 'Other sessions signed out.', ok: true }
    await loadSessions()
  }
  catch (e) {
    fail(e)
  }
  finally { revokingOthers.value = false }
}

function describeAgent(userAgent?: string | null): string {
  if (!userAgent) return 'unknown device'
  const browser = /firefox/i.test(userAgent) ? 'Firefox' : /edg/i.test(userAgent) ? 'Edge' : /chrome/i.test(userAgent) ? 'Chrome' : /safari/i.test(userAgent) ? 'Safari' : 'Browser'
  const os = /mac os/i.test(userAgent) ? 'macOS' : /windows/i.test(userAgent) ? 'Windows' : /linux/i.test(userAgent) ? 'Linux' : /iphone|ipad/i.test(userAgent) ? 'iOS' : /android/i.test(userAgent) ? 'Android' : ''
  return os ? `${browser} · ${os}` : browser
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleString()
}

// --- Danger zone ---------------------------------------------------------------

const deleting = ref(false)
async function doDelete() {
  if (!confirm('Send an account-deletion confirmation email?')) return
  msg.value = null
  deleting.value = true
  try {
    unwrapAuth(await deleteAccount())
    msg.value = { text: 'Deletion confirmation email sent — the account is removed once you approve it.', ok: true }
  }
  catch (e) {
    fail(e)
  }
  finally { deleting.value = false }
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="passkeys · sessions · deleteAccount"
      title="Privacy & security"
    >
      Everything that guards the account: email verification, the passkeys that
      sign you in, active sessions on other devices, and the confirmed-by-email
      account deletion flow.
    </PageHeader>

    <LabPanel
      label="verification"
      title="Email verification"
      tone="accent"
    >
      <!-- Session state differs between SSR and hydration — render client-only. -->
      <ClientOnly>
        <div class="row">
          <StatusRing
            :tone="user?.emailVerified ? 'ok' : 'warn'"
            :pulse="!user?.emailVerified"
          >
            {{ user?.emailVerified ? 'address verified' : 'address unverified' }}
          </StatusRing>
          <span class="hint">
            OTP sign-in verifies automatically — only passkey-first accounts start
            unverified.
          </span>
          <LabButton
            v-if="user && user.emailVerified === false"
            variant="signal"
            :loading="sendingVerify"
            @click="sendVerification"
          >
            Send verification email
          </LabButton>
        </div>
        <template #fallback>
          <StatusRing tone="muted">
            checking…
          </StatusRing>
        </template>
      </ClientOnly>
    </LabPanel>

    <LabPanel
      label="webauthn"
      title="Passkeys"
    >
      <p
        v-if="passkeysLoaded && passkeys.length === 0"
        class="hint"
      >
        No passkeys yet — add one to sign in without codes.
      </p>
      <div
        v-else
        class="rows"
      >
        <div
          v-for="row in passkeys"
          :key="row.id"
          class="item-row"
        >
          <Icon
            name="key"
            :size="15"
          />
          <span class="item-name">{{ row.name || 'Unnamed passkey' }}</span>
          <span class="item-meta mono">{{ row.deviceType ?? '' }} · {{ formatDate(row.createdAt) }}</span>
          <LabButton
            variant="ghost"
            size="sm"
            @click="renamePasskey(row)"
          >
            Rename
          </LabButton>
          <LabButton
            variant="danger"
            size="sm"
            @click="removePasskey(row)"
          >
            Remove
          </LabButton>
        </div>
      </div>
      <div
        class="row"
        style="margin-top: 0.85rem"
      >
        <LabButton
          variant="signal"
          :loading="addingPasskey"
          @click="addPasskey"
        >
          Add passkey on this device
        </LabButton>
      </div>
    </LabPanel>

    <LabPanel
      label="devices"
      title="Active sessions"
    >
      <div class="rows">
        <div
          v-for="row in sessions"
          :key="row.token"
          class="item-row"
        >
          <SignalDot
            :tone="row.token === currentToken ? 'ok' : 'accent'"
            :pulse="row.token === currentToken"
          />
          <span class="item-name">{{ describeAgent(row.userAgent) }}</span>
          <span class="item-meta mono">{{ formatDate(row.createdAt) }}</span>
          <StatusPill
            v-if="row.token === currentToken"
            tone="ok"
            dot
          >
            this device
          </StatusPill>
          <LabButton
            v-else
            variant="danger"
            size="sm"
            @click="revoke(row)"
          >
            Revoke
          </LabButton>
        </div>
      </div>
      <div
        class="row"
        style="margin-top: 0.85rem"
      >
        <LabButton
          variant="ghost"
          :loading="revokingOthers"
          :disabled="sessions.length <= 1"
          @click="revokeOthers"
        >
          Sign out other sessions
        </LabButton>
      </div>
    </LabPanel>

    <LabPanel
      label="danger zone"
      title="Delete account"
      variant="well"
    >
      <p class="hint">
        Deletion is confirmed via email — nothing happens until you approve it
        from the inbox. Subscriptions, workspaces and credits go with it.
      </p>
      <div
        class="row"
        style="margin-top: 0.85rem"
      >
        <LabButton
          variant="danger"
          :loading="deleting"
          @click="doDelete"
        >
          Delete account
        </LabButton>
        <LabButton
          variant="ghost"
          @click="signOut"
        >
          Sign out
        </LabButton>
      </div>
    </LabPanel>

    <p
      v-if="msg"
      class="msg"
      :class="{ ok: msg.ok, err: !msg.ok }"
    >
      {{ msg.text }}
    </p>
  </div>
</template>

<style scoped>
.rows { display: flex; flex-direction: column; gap: 0.45rem; }
.item-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.7rem; border-radius: var(--r-sm);
  background: var(--surface); box-shadow: var(--raise-sm);
  font-size: 0.82rem;
}
.item-row :deep(svg) { color: var(--accent); flex-shrink: 0; }
.item-name { font-weight: 600; }
.item-meta { flex: 1; font-size: 0.68rem; color: var(--ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.msg { margin: 0; font-size: 0.8rem; }
.msg.ok { color: var(--ok); }
.msg.err { color: var(--err); }
</style>
