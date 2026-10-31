<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'
import { isSandboxIdentity, newSandboxIdentity, normalizeTestEmail } from '../utils/testEmail'

/**
 * The visitor's sandbox identities: a toggle per address this device
 * remembers (the one in the email field is pressed, marked by a tick as
 * well as its green) and a key that makes a new one. `v-model` is the email
 * field; picking or making an address sets it. The sign-in page and the
 * sign-in demo on the docs share the list, so an address made in one signs
 * in from the other.
 *
 * A new identity never replaces the others, since an address is the only
 * way back into its account. Storage can be unavailable (a private window,
 * blocked site data): the identities then last this visit.
 */
const email = defineModel<string>({ required: true })

const STORAGE_KEY = 'nuxt-backend:sandbox-identities'

/** How many identities this device remembers, newest first. */
const MAX_IDENTITIES = 5

const identities = ref<string[]>([])
const labelId = useId()

onMounted(() => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (Array.isArray(saved)) {
      identities.value = saved.filter((item): item is string => typeof item === 'string' && isSandboxIdentity(item))
        .slice(0, MAX_IDENTITIES)
    }
  }
  catch { /* storage unavailable or unreadable */ }
})

function create() {
  const address = newSandboxIdentity()
  identities.value = [address, ...identities.value].slice(0, MAX_IDENTITIES)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identities.value))
  }
  catch { /* storage unavailable */ }
  email.value = address
}

const picked = (address: string) => normalizeTestEmail(email.value) === address
</script>

<template>
  <div class="grid gap-2">
    <p
      :id="labelId"
      class="stamp"
    >
      Sandbox identity
    </p>
    <!-- A labelled group of toggles: the one in the field is pressed,
         marked by a tick as well as its green. -->
    <div
      role="group"
      :aria-labelledby="labelId"
      class="flex flex-wrap gap-2"
    >
      <button
        v-for="address in identities"
        :key="address"
        type="button"
        class="slot slot-xs inline-flex items-start gap-1.5 px-2.5 py-1.5 text-left font-mono text-xs break-all"
        :class="picked(address) ? 'font-semibold text-(--ok)' : 'text-(--ink-dim) hover:text-(--ink)'"
        :aria-pressed="picked(address)"
        @click="email = address"
      >
        <svg
          v-if="picked(address)"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 12 12"
          class="mt-px size-3 flex-none"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 6.5l2.5 2.5 4.5-6" />
        </svg>
        {{ address }}
      </button>
      <Key
        size="xs"
        @click="create"
      >
        {{ identities.length ? 'New identity' : 'Create a sandbox identity' }}
      </Key>
    </div>
    <p class="text-xs leading-relaxed text-(--ink-dim)">
      The playground is a sandbox: an account is a generated address, and its
      sign-in code shows up right here. This device remembers your last
      {{ MAX_IDENTITIES }}. Anyone who knows an address can sign in as it, so
      keep it to yourself and keep nothing real in the account.
    </p>
  </div>
</template>
