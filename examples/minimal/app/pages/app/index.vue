<script setup lang="ts">
import { computed, ref } from 'vue'

definePageMeta({ middleware: 'auth' })

const { user, signOut } = useAuth()
const { organizations, setActive, create, invite } = useOrganization()
const billing = useBilling()
const credits = useCredits()

const workspaceName = ref('')
const inviteEmail = ref('')
const giftEmail = ref('')
const notice = ref('')

// Product keys come from setupBilling's `products` map — unconfigured, the
// billing panels just show their empty states.
const planId = computed(() => billing.products.value?.pro?.id)
const packId = computed(() => billing.products.value?.credits100?.id)

async function addWorkspace() {
  const name = workspaceName.value.trim()
  if (!name) return
  await create({ name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}` })
  workspaceName.value = ''
}

async function sendInvite() {
  const email = inviteEmail.value.trim()
  if (!email) return
  // The invitee gets an email with an accept link; the module's built-in
  // /accept-invitation page handles the rest.
  await invite({ email })
  inviteEmail.value = ''
  notice.value = `Invitation email sent to ${email}.`
}

async function sendGift() {
  const email = giftEmail.value.trim()
  if (!packId.value || !email) return
  // The recipient receives the credits — attached automatically if they have
  // an account, claimed on their first sign-in otherwise (<GiftClaimBanner>).
  await credits.gift(packId.value, { recipientEmail: email })
  giftEmail.value = ''
  notice.value = `Checkout opened — once paid, ${email} receives the credits.`
}

async function logout() {
  await signOut()
  await navigateTo('/')
}
</script>

<template>
  <main>
    <nav>
      <strong>Minimal example</strong>
      <span class="spacer" />
      <span class="muted">{{ user?.email }}</span>
      <button @click="logout">
        Sign out
      </button>
    </nav>

    <!-- Gifts sent to this account, claimable with one click. -->
    <GiftClaimBanner @claimed="notice = 'Gift received — credits added. 🎁'" />

    <OrganizationBoundary>
      <template #default="{ workspace }">
        <section>
          <h2>Workspace</h2>
          <div class="row">
            <select
              :value="workspace.id"
              @change="setActive(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="entry in organizations"
                :key="entry.id"
                :value="entry.id"
              >
                {{ entry.name }}
              </option>
            </select>
            <form
              class="row"
              @submit.prevent="addWorkspace"
            >
              <input
                v-model="workspaceName"
                placeholder="New workspace"
              >
              <button type="submit">
                Create
              </button>
            </form>
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
              Invite by email
            </button>
          </form>
        </section>
      </template>
    </OrganizationBoundary>

    <section>
      <h2>Plan</h2>
      <p class="muted">
        {{ billing.isSubscribed.value
          ? `Subscribed — ${billing.subscription.value?.status}`
          : 'Free plan' }}
      </p>
      <div class="row">
        <button
          v-if="planId && !billing.isSubscribed.value"
          class="primary"
          @click="billing.checkout(planId)"
        >
          Upgrade to Pro
        </button>
        <button
          v-if="billing.isSubscribed.value"
          @click="billing.portal()"
        >
          Manage billing
        </button>
      </div>
      <!-- FeatureBoundary gates on a granted benefit (metadata key 'premium'). -->
      <FeatureBoundary feature="premium">
        <p>✨ Premium features unlocked.</p>
        <template #fallback>
          <p class="muted">
            Premium features are locked — upgrade to unlock.
          </p>
        </template>
      </FeatureBoundary>
    </section>

    <section>
      <h2>Credits</h2>
      <p>
        Balance: <strong>{{ credits.balance.value ?? '—' }}</strong>
        <span class="muted"> ({{ credits.consumed.value ?? 0 }} spent)</span>
      </p>
      <div class="row">
        <button
          v-if="packId"
          @click="credits.topUp(packId)"
        >
          Buy 100 credits
        </button>
        <button @click="credits.refresh()">
          Refresh
        </button>
      </div>
      <form
        class="row"
        @submit.prevent="sendGift"
      >
        <input
          v-model="giftEmail"
          type="email"
          placeholder="friend@example.com"
        >
        <button
          type="submit"
          :disabled="!packId"
        >
          Gift 100 credits
        </button>
      </form>
    </section>

    <p
      v-if="notice"
      class="muted"
    >
      {{ notice }}
    </p>
  </main>
</template>
