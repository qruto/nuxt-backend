<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({ auth: true })

const { user, signOut } = useAuth()
const { workspaces, setActive, invite } = useWorkspace()
const billing = useBilling()
// Gifts wait until their recipient claims them: the banner's button, or
// gifts.claim(gift.id), grants the credits to this account.
const gifts = useGifts()

const inviteEmail = ref('')
const notice = ref('')

async function sendInvite() {
  const email = inviteEmail.value.trim()
  if (!email) return
  // A refused invitation rejects with the reason.
  try {
    await invite({ email })
    inviteEmail.value = ''
    notice.value = `Invitation sent — the custom template links to /join.`
  }
  catch (error) {
    notice.value = error instanceof Error ? error.message : String(error)
  }
}

async function logout() {
  await signOut()
  await navigateTo('/')
}
</script>

<template>
  <main>
    <nav>
      <strong>Advanced example</strong>
      <span class="spacer" />
      <span class="muted">{{ user?.email }}</span>
      <button @click="logout">
        Sign out
      </button>
    </nav>

    <BackendNotices />
    <p
      v-if="gifts.unclaimed.value.length"
      class="muted"
    >
      {{ gifts.unclaimed.value.length }} gift(s) waiting — claim above.
    </p>

    <Gate workspace>
      <template #default="{ workspace }">
        <section>
          <h2>Workspace</h2>
          <div class="row">
            <select
              :value="workspace.id"
              @change="setActive(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="entry in workspaces"
                :key="entry.id"
                :value="entry.id"
              >
                {{ entry.name }}
              </option>
            </select>
          </div>
          <form
            class="row"
            @submit.prevent="sendInvite"
          >
            <input
              v-model="inviteEmail"
              type="email"
              placeholder="teammate@example.com"
            >
            <button type="submit">
              Invite (custom email → /join)
            </button>
          </form>
        </section>
      </template>
    </Gate>

    <section>
      <h2>Billing</h2>
      <p class="muted">
        {{ billing.isSubscribed.value ? 'Subscribed' : 'Free plan' }} —
        webhooks arrive on the custom <code>/hooks/billing</code> path, and the
        <code>order.paid</code> hook in <code>backend/billing.ts</code> writes
        each paid order to the app's own <code>orders</code> table.
      </p>
      <Gate feature="premium">
        <p>✨ Premium unlocked.</p>
        <template #fallback>
          <p class="muted">
            Premium locked.
          </p>
        </template>
      </Gate>
    </section>

    <p
      v-if="notice"
      class="muted"
    >
      {{ notice }}
    </p>
  </main>
</template>
