<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ auth: true })

const { workspaces, setActive, create, invite } = useWorkspace()
const billing = useBilling()
const credits = useCredits()
const gifts = useGifts()
// A metered action from backend/ai.ts: each call spends one credit.
const transform = useAction(api.ai.transform)

const workspaceName = ref('')
const inviteEmail = ref('')
const giftEmail = ref('')
const notice = ref('')

// Product keys are the plan and pack keys in backend/billing.catalog.ts. On a
// billing provider's sandbox with `npx nuxt-backend billing sync`; until then
// the billing panels show their empty states.
const planId = computed(() => billing.products.value?.pro?.id)
const packId = computed(() => billing.products.value?.credits500?.id)

// Each action rejects with the reason when it is refused (a taken slug, an
// address the app can't email yet): show it where the confirmations go.
async function attempt(action: () => Promise<unknown>, done: string) {
  try {
    await action()
    notice.value = done
  }
  catch (error) {
    notice.value = error instanceof Error ? error.message : String(error)
  }
}

async function addWorkspace() {
  const name = workspaceName.value.trim()
  if (!name) return
  await attempt(async () => {
    await create({ name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}` })
    workspaceName.value = ''
  }, `Workspace ${name} created.`)
}

async function sendInvite() {
  const email = inviteEmail.value.trim()
  if (!email) return
  // The invitee gets an email with an accept link; the module's built-in
  // /accept-invitation page handles the rest.
  await attempt(async () => {
    await invite({ email })
    inviteEmail.value = ''
  }, `Invitation email sent to ${email}.`)
}

async function sendGift() {
  const email = giftEmail.value.trim()
  if (!packId.value || !email) return
  // A gift is a credit pack, named by its catalog key, paid on your own
  // billing account. The recipient signs in and claims the credits into
  // theirs (the gift notice of <BackendNotices>).
  await attempt(async () => {
    await gifts.send('credits500', { recipientEmail: email })
    giftEmail.value = ''
  }, `Checkout opened — once paid, ${email} receives the credits.`)
}

async function spendCredit() {
  // Reserve → run → settle: a run that fails releases the credit.
  await attempt(() => transform({ prompt: 'hello' }), 'Spent 1 credit.')
}
</script>

<template>
  <div class="page">
    <ActivationChecklist />

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
    </Gate>

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
      <!-- <Gate feature> shows a region by a feature key from billing.catalog.ts. -->
      <Gate feature="priority_support">
        <p>Priority support is on.</p>
        <template #fallback>
          <p class="muted">
            Priority support comes with Pro.
          </p>
        </template>
      </Gate>
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
          Buy 500 credits
        </button>
        <button @click="spendCredit">
          Spend 1 credit
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
          Gift 500 credits
        </button>
      </form>
    </section>

    <p
      v-if="notice"
      class="muted"
    >
      {{ notice }}
    </p>
  </div>
</template>
