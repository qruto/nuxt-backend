<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({ layout: false })

const { client } = useAuth()

const mode = ref<'signin' | 'signup'>('signin')
const name = ref('')
const email = ref('')
const password = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

async function submit() {
  pending.value = true
  error.value = null
  try {
    if (mode.value === 'signup') {
      await client.signUp.email({
        name: name.value,
        email: email.value,
        password: password.value,
      })
    }
    else {
      await client.signIn.email({
        email: email.value,
        password: password.value,
      })
    }
    await navigateTo('/')
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Authentication failed'
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <main class="page">
    <h1>{{ mode === 'signin' ? 'Sign in' : 'Sign up' }}</h1>

    <form @submit.prevent="submit">
      <label v-if="mode === 'signup'">
        Name
        <input
          v-model="name"
          type="text"
          required
        >
      </label>
      <label>
        Email
        <input
          v-model="email"
          type="email"
          required
        >
      </label>
      <label>
        Password
        <input
          v-model="password"
          type="password"
          minlength="8"
          required
        >
      </label>

      <button
        type="submit"
        :disabled="pending"
      >
        {{ pending ? 'Please wait...' : (mode === 'signin' ? 'Sign in' : 'Create account') }}
      </button>

      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>
    </form>

    <p>
      <button
        type="button"
        class="link"
        @click="mode = mode === 'signin' ? 'signup' : 'signin'"
      >
        {{ mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in' }}
      </button>
    </p>
  </main>
</template>

<style scoped>
.page { max-width: 360px; margin: 4rem auto; font-family: system-ui, sans-serif; }
form { display: flex; flex-direction: column; gap: 0.75rem; }
label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
input { padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
button[type="submit"] { padding: 0.5rem; cursor: pointer; }
.link { background: none; border: none; color: #0070f3; cursor: pointer; padding: 0; }
.error { color: #c00; }
</style>
