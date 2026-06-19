<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({ layout: false })

const { client, session } = useAuth()

type Step = 'choose' | 'register-passkey' | 'request-code' | 'verify-code' | 'add-passkey'

const step = ref<Step>('choose')
const name = ref('')
const email = ref('')
const otp = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

function setError(message: string) {
  error.value = message
}

function clearError() {
  error.value = null
}

function trimmedName() {
  return name.value.trim()
}

function trimmedEmail() {
  return email.value.trim().toLowerCase()
}

function passkeyRegistrationContext() {
  return JSON.stringify({
    email: trimmedEmail(),
    name: trimmedName(),
  })
}

async function refreshSession() {
  await session.value.refetch()
}

type AuthResult = { error?: { message?: string } | null }

/** Throws when an auth call returned an error, using a friendly fallback. */
function ensureOk(result: AuthResult, fallback: string) {
  if (result.error) {
    throw new Error(result.error.message ?? fallback)
  }
}

/** Runs an async auth step with shared pending/error handling. */
async function runStep(fallback: string, step: () => Promise<void>) {
  pending.value = true
  clearError()
  try {
    await step()
  }
  catch (cause) {
    setError(cause instanceof Error ? cause.message : fallback)
  }
  finally {
    pending.value = false
  }
}

async function signInWithPasskey() {
  await runStep('Passkey sign-in failed', async () => {
    ensureOk(await client.signIn.passkey(), 'Passkey sign-in failed')
    await refreshSession()
    await navigateTo('/')
  })
}

function startPasskeyRegistration() {
  clearError()
  otp.value = ''
  step.value = 'register-passkey'
}

function startEmailFlow() {
  clearError()
  otp.value = ''
  step.value = 'request-code'
}

async function registerWithPasskey() {
  clearError()

  if (!trimmedName()) {
    setError('Enter your name to register a passkey.')
    return
  }
  if (!trimmedEmail()) {
    setError('Enter your email to register a passkey.')
    return
  }

  await runStep('Passkey registration failed', async () => {
    ensureOk(
      await client.passkey.addPasskey({ context: passkeyRegistrationContext() }),
      'Failed to register passkey',
    )
    await refreshSession()
    await navigateTo('/')
  })
}

async function sendCode() {
  await runStep('Failed to send code', async () => {
    ensureOk(
      await client.emailOtp.sendVerificationOtp({
        email: trimmedEmail(),
        type: 'sign-in',
      }),
      'Failed to send code',
    )
    step.value = 'verify-code'
  })
}

async function verifyCode() {
  await runStep('Verification failed', async () => {
    const displayName = trimmedName()
    ensureOk(
      await client.signIn.emailOtp({
        email: trimmedEmail(),
        otp: otp.value.trim(),
        ...(displayName ? { name: displayName } : {}),
      }),
      'Invalid code',
    )
    await refreshSession()
    step.value = 'add-passkey'
  })
}

async function addPasskeyToCurrentAccount() {
  await runStep('Passkey registration failed', async () => {
    ensureOk(await client.passkey.addPasskey(), 'Failed to register passkey')
    await navigateTo('/')
  })
}

async function skipPasskey() {
  await navigateTo('/')
}
</script>

<template>
  <main class="page">
    <div class="auth-card">
      <div class="auth-brand">
        <span class="auth-glyph">◳</span>
        <div class="auth-brandtext">
          <span class="auth-name">nuxt-backend</span>
          <span class="auth-sub">SIGNAL&nbsp;LAB · ACCESS</span>
        </div>
        <span class="auth-sweep" />
      </div>

      <div class="auth-body">
        <h1>Sign in</h1>
        <p class="muted">
          Use a passkey or an email code to enter the playground.
        </p>

        <section v-if="step === 'choose'">
          <button
            type="button"
            :disabled="pending"
            @click="signInWithPasskey"
          >
            {{ pending ? 'Waiting…' : 'Sign in with passkey' }}
          </button>

          <button
            type="button"
            class="secondary"
            :disabled="pending"
            @click="startPasskeyRegistration"
          >
            Create account with passkey
          </button>

          <div class="divider-wrapper">
            <hr class="divider-line">
            <span class="divider">or</span>
            <hr class="divider-line">
          </div>

          <button
            type="button"
            class="secondary"
            :disabled="pending"
            @click="startEmailFlow"
          >
            Continue with email code
          </button>
        </section>

        <form
          v-else-if="step === 'register-passkey'"
          @submit.prevent="registerWithPasskey"
        >
          <h2>Create account with passkey</h2>
          <label>
            Name
            <input
              v-model="name"
              type="text"
              autocomplete="name"
              required
            >
          </label>
          <label>
            Email
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              required
            >
          </label>
          <button
            type="submit"
            :disabled="pending"
          >
            {{ pending ? 'Creating…' : 'Create passkey account' }}
          </button>
          <button
            type="button"
            class="link"
            :disabled="pending"
            @click="step = 'choose'"
          >
            Back
          </button>
        </form>

        <form
          v-else-if="step === 'request-code'"
          @submit.prevent="sendCode"
        >
          <h2>Email code</h2>
          <label>
            <span>Name <span class="hint">for new accounts</span></span>
            <input
              v-model="name"
              type="text"
              autocomplete="name"
            >
          </label>
          <label>
            Email
            <input
              v-model="email"
              type="email"
              autocomplete="email"
              required
            >
          </label>
          <button
            type="submit"
            :disabled="pending"
          >
            {{ pending ? 'Sending…' : 'Email me a code' }}
          </button>
          <button
            type="button"
            class="link"
            :disabled="pending"
            @click="step = 'choose'"
          >
            Back
          </button>
        </form>

        <form
          v-else-if="step === 'verify-code'"
          @submit.prevent="verifyCode"
        >
          <p class="muted">
            We sent a verification code to <strong>{{ email }}</strong> via the
            nested Resend component. Without <code>RESEND_API_KEY</code> set, the
            code is logged to the Convex function console instead.
          </p>
          <label>
            Verification code
            <input
              v-model="otp"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              required
            >
          </label>
          <button
            type="submit"
            :disabled="pending"
          >
            {{ pending ? 'Verifying…' : 'Verify' }}
          </button>
          <button
            type="button"
            class="link"
            :disabled="pending"
            @click="step = 'request-code'"
          >
            Use a different email
          </button>
        </form>

        <section v-else-if="step === 'add-passkey'">
          <h2>Add a passkey</h2>
          <p class="muted">
            Save a passkey on this device so you can sign in instantly next time.
          </p>
          <button
            type="button"
            :disabled="pending"
            @click="addPasskeyToCurrentAccount"
          >
            {{ pending ? 'Adding…' : 'Add passkey' }}
          </button>
          <button
            type="button"
            class="link"
            :disabled="pending"
            @click="skipPasskey"
          >
            Skip for now
          </button>
        </section>

        <p
          v-if="error"
          class="error"
        >
          {{ error }}
        </p>
      </div>

      <Oscilloscope
        class="auth-scope"
        :height="56"
        :speed="9"
        :amp="0.42"
        :density="2"
        :grid="false"
      />
    </div>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  /* transparent so the body's signal-grid + phosphor bloom show through */
  background: transparent;
}
.auth-card {
  width: 100%;
  max-width: 392px;
  border: 1px solid var(--edge);
  border-radius: var(--radius-lg);
  background: var(--panel);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

/* brand header */
.auth-brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.95rem 1.15rem;
  border-bottom: 1px solid var(--edge);
  background: var(--panel-2);
  overflow: hidden;
}
.auth-glyph { font-size: 1.25rem; color: var(--accent); filter: drop-shadow(0 1px 3px var(--accent-glow)); }
.auth-brandtext { display: flex; flex-direction: column; line-height: 1.1; }
.auth-name { font-family: var(--mono); font-size: 0.82rem; font-weight: 700; letter-spacing: -.01em; }
.auth-sub { font-family: var(--mono); font-size: 0.55rem; font-weight: 700; letter-spacing: .2em; color: var(--accent); }
.auth-sweep {
  position: absolute;
  left: 0; bottom: 0;
  width: 32%; height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: sweep 5.5s linear infinite;
  opacity: 0.6;
}

.auth-scope {
  display: block;
  border-top: 1px solid var(--edge);
  background: color-mix(in srgb, var(--panel-2) 60%, transparent);
  opacity: 0.85;
}

.auth-body { padding: 1.55rem 1.35rem 1.65rem; display: flex; flex-direction: column; gap: 0.95rem; }
section, form { display: flex; flex-direction: column; gap: 0.65rem; }
label { display: flex; flex-direction: column; gap: 0.32rem; font-size: 0.82rem; font-weight: 500; color: var(--ink-dim); }
.hint { color: var(--ink-faint); font-weight: 400; font-size: 0.78rem; }
input {
  padding: 0.58rem 0.7rem;
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.95rem;
  transition: border-color var(--transition), box-shadow var(--transition);
}
input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

button {
  padding: 0.62rem 0.9rem;
  cursor: pointer;
  border-radius: var(--radius);
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  font: inherit;
  font-weight: 600;
  transition: background var(--transition), border-color var(--transition),
    color var(--transition), box-shadow var(--transition),
    transform var(--press) var(--ease-out);
}
button:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
/* Lift only on real hover-capable pointers (avoids sticky hover on touch). */
@media (hover: hover) and (pointer: fine) {
  button:hover:not(:disabled) { transform: translateY(-1px); }
}
button:active:not(:disabled) { transform: scale(0.97); }
button.secondary { background: transparent; color: var(--ink); border-color: var(--edge-hi); }
button.secondary:hover:not(:disabled) { background: var(--panel-hi); border-color: var(--accent); color: var(--accent); }
button.link { background: none; border: none; color: var(--ink-dim); cursor: pointer; padding: 0.15rem 0; text-align: center; font-weight: 500; font-size: 0.88rem; }
button.link:hover { color: var(--accent); text-decoration: underline; }
button:disabled { opacity: 0.5; cursor: not-allowed; }

.divider-wrapper { display: flex; align-items: center; text-align: center; width: 100%; margin: 0.15rem 0; }
.divider-line { flex-grow: 1; border: none; border-top: 1px solid var(--edge); margin: 0; }
.divider { padding: 0 0.55rem; color: var(--ink-faint); font-size: 0.7rem; font-family: var(--mono); letter-spacing: 0.08em; text-transform: uppercase; }

.muted { color: var(--ink-dim); font-size: 0.85rem; margin: 0; line-height: 1.5; }
.error { color: var(--err); padding: 0.6rem 0.7rem; background: var(--err-dim); border: 1px solid color-mix(in srgb, var(--err) 28%, transparent); border-radius: var(--radius); font-size: 0.82rem; }
h1 { margin: 0; font-family: var(--display); font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.02; }
h2 { margin: 0; font-family: var(--display); font-size: 1.3rem; font-weight: 600; letter-spacing: -0.01em; }
</style>
