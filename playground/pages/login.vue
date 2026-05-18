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

async function signInWithPasskey() {
  pending.value = true
  clearError()
  try {
    const { error: signInError } = await client.signIn.passkey()
    if (signInError) {
      throw new Error(signInError.message ?? 'Passkey sign-in failed')
    }
    await refreshSession()
    await navigateTo('/')
  }
  catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Passkey sign-in failed')
  }
  finally {
    pending.value = false
  }
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

  pending.value = true
  try {
    const { error: addError } = await client.passkey.addPasskey({
      context: passkeyRegistrationContext(),
    })
    if (addError) {
      throw new Error(addError.message ?? 'Failed to register passkey')
    }
    await refreshSession()
    await navigateTo('/')
  }
  catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Passkey registration failed')
  }
  finally {
    pending.value = false
  }
}

async function sendCode() {
  pending.value = true
  clearError()
  try {
    const { error: otpError } = await client.emailOtp.sendVerificationOtp({
      email: trimmedEmail(),
      type: 'sign-in',
    })
    if (otpError) {
      throw new Error(otpError.message ?? 'Failed to send code')
    }
    step.value = 'verify-code'
  }
  catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Failed to send code')
  }
  finally {
    pending.value = false
  }
}

async function verifyCode() {
  pending.value = true
  clearError()
  try {
    const displayName = trimmedName()
    const { error: verifyError } = await client.signIn.emailOtp({
      email: trimmedEmail(),
      otp: otp.value.trim(),
      ...(displayName ? { name: displayName } : {}),
    })
    if (verifyError) {
      throw new Error(verifyError.message ?? 'Invalid code')
    }

    await refreshSession()
    step.value = 'add-passkey'
  }
  catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Verification failed')
  }
  finally {
    pending.value = false
  }
}

async function addPasskeyToCurrentAccount() {
  pending.value = true
  clearError()
  try {
    const { error: addError } = await client.passkey.addPasskey()
    if (addError) {
      throw new Error(addError.message ?? 'Failed to register passkey')
    }
    await navigateTo('/')
  }
  catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Passkey registration failed')
  }
  finally {
    pending.value = false
  }
}

async function skipPasskey() {
  await navigateTo('/')
}
</script>

<template>
  <main class="page">
    <h1>Sign in</h1>
    <p class="muted">
      Use a passkey or an email code for this playground.
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
        We sent a verification code to <strong>{{ email }}</strong>.
        Check the Convex function console for the code.
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
  </main>
</template>

<style scoped>
.page { max-width: 360px; margin: 4rem auto; display: flex; flex-direction: column; gap: 1rem; }
section, form { display: flex; flex-direction: column; gap: 0.75rem; }
label { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.875rem; font-weight: 500; }
input { padding: 0.5rem; border: 1px solid var(--input-border); border-radius: 4px; background: var(--input-bg); color: var(--text-color); font-size: 1rem; }
input:focus { outline: none; border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color); }
button { padding: 0.6rem 0.75rem; cursor: pointer; border-radius: 4px; border: 1px solid var(--primary-color); background: var(--primary-color); color: white; font: inherit; font-weight: 500; transition: background-color 0.2s, opacity 0.2s; }
button:hover:not(:disabled) { background: var(--primary-hover); }
button.secondary { background: transparent; color: var(--primary-color); }
button.secondary:hover:not(:disabled) { background: rgba(59, 130, 246, 0.1); }
button.link { background: none; border: none; color: var(--link-color); cursor: pointer; padding: 0; text-align: center; }
button.link:hover { text-decoration: underline; }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.divider-wrapper { display: flex; align-items: center; text-align: center; width: 100%; margin: 0.5rem 0; }
.divider-line { flex-grow: 1; border: none; border-top: 1px solid var(--border-color); margin: 0; }
.divider { padding: 0 0.5rem; color: var(--muted-color); font-size: 0.875rem; }
.muted { color: var(--muted-color); font-size: 0.875rem; margin: 0; line-height: 1.5; }
.error { color: var(--danger-color); padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border-radius: 4px; font-size: 0.875rem; }
h1 { margin: 0; font-size: 1.875rem; margin-bottom: 0.25rem; }
h2 { margin: 0; font-size: 1.25rem; }
</style>
