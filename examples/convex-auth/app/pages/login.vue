<script setup lang="ts">
import { api } from '#backend/api'

// A signed-in visitor is sent on to `?redirect=`, or home.
definePageMeta({ middleware: 'convex-auth-guest' })

const route = useRoute()
const { signIn, pending: signingIn } = useSignInWithUsernamePassword(api.auth)
const { signUp, pending: signingUp } = useSignUpWithUsernamePassword(api.auth)
const mode = ref<'sign-in' | 'sign-up'>('sign-in')
const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const pending = computed(() => signingIn.value || signingUp.value)

async function onSubmit() {
  error.value = null
  const credentials = { username: username.value, password: password.value }
  const result = mode.value === 'sign-in' ? await signIn(credentials) : await signUp(credentials)
  if (result.status === 'complete') await navigateTo(resolveAuthRedirect(route.query.redirect))
  else error.value = result.userError.error
}
</script>

<template>
  <div>
    <h1>{{ mode === 'sign-in' ? 'Sign in' : 'Create an account' }}</h1>
    <form @submit.prevent="onSubmit">
      <label>
        Username
        <input
          v-model="username"
          name="username"
          autocomplete="username"
          required
          :disabled="pending"
        >
      </label>
      <label>
        Password
        <input
          v-model="password"
          name="password"
          type="password"
          :autocomplete="mode === 'sign-in' ? 'current-password' : 'new-password'"
          required
          :disabled="pending"
        >
      </label>
      <button
        type="submit"
        :disabled="pending"
      >
        {{ mode === 'sign-in' ? 'Sign in' : 'Create the account' }}
      </button>
      <p
        v-if="error"
        role="alert"
      >
        {{ error }}
      </p>
    </form>
    <p>
      <button
        type="button"
        @click="mode = mode === 'sign-in' ? 'sign-up' : 'sign-in'"
      >
        {{ mode === 'sign-in' ? 'No account yet? Create one' : 'Have an account? Sign in' }}
      </button>
    </p>
  </div>
</template>
