<template>
  <div>
    <h1>nuxt-convex-backend playground</h1>
    <p v-if="!session">
      <button @click="signIn">
        Sign In
      </button>
    </p>
    <div v-else>
      <p>Welcome, {{ session.user?.name || session.user?.email }}</p>
      <button @click="signOut">
        Sign Out
      </button>
    </div>
  </div>
</template>

<script setup>
const { data: session } = await useSession()

async function signIn() {
  // Example: email/password sign-in
  // authClient.signIn.email({ email: '...', password: '...' })
}

async function signOut() {
  // authClient.signOut()
}
</script>
