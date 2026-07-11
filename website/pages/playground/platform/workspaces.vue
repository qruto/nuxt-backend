<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({ middleware: 'auth' })

const {
  organizations, current, member, role, members, isLoading,
  setActive, create, invite, leave,
} = useOrganization()

const newName = ref('')
const inviteEmail = ref('')
const pending = ref(false)
const notice = ref<string | null>(null)

function slugify(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`
}

async function run(action: () => Promise<unknown>, message: string) {
  pending.value = true
  notice.value = null
  try {
    await action()
    notice.value = message
  }
  catch (cause) {
    notice.value = cause instanceof Error ? cause.message : 'Something went wrong'
  }
  finally {
    pending.value = false
  }
}

async function createWorkspace() {
  const name = newName.value.trim()
  if (!name) return
  await run(async () => {
    await create({ name, slug: slugify(name) })
    newName.value = ''
  }, `Workspace “${name}” created — switch to it below.`)
}

async function switchTo(id: string) {
  await run(() => setActive(id), 'Workspace switched — every workspace-scoped query (billing, credits, …) now reads the new one.')
}

async function sendInvite() {
  const email = inviteEmail.value.trim()
  if (!email) return
  await run(async () => {
    await invite({ email })
    inviteEmail.value = ''
  }, `Invitation sent to ${email}.`)
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useOrganization"
      title="Workspaces"
      live
    >
      Every user gets a personal workspace on first sign-in and can create more —
      <code>useOrganization()</code> lists them, switches the active one (the
      switch refreshes the Convex token, so workspace-scoped queries re-run
      instantly), and manages members and invitations.
    </PageHeader>

    <div class="grid-2">
      <LabPanel
        label="workspaces"
        title="Your workspaces"
        tone="accent"
      >
        <p
          v-if="isLoading"
          class="hint"
        >
          loading workspaces…
        </p>
        <ul
          v-else
          class="wslist"
        >
          <li
            v-for="workspace in organizations"
            :key="workspace.id"
            class="wsrow"
            :class="{ active: workspace.id === current?.id }"
          >
            <span class="wsname">{{ workspace.name }}</span>
            <span
              v-if="workspace.id === current?.id"
              class="wsbadge"
            >active · {{ role }}</span>
            <LabButton
              v-else
              variant="ghost"
              size="sm"
              :disabled="pending"
              @click="switchTo(workspace.id)"
            >
              Switch
            </LabButton>
          </li>
        </ul>

        <form
          class="wsform"
          @submit.prevent="createWorkspace"
        >
          <input
            v-model="newName"
            type="text"
            placeholder="New workspace name"
            :disabled="pending"
          >
          <LabButton
            type="submit"
            :disabled="pending || !newName.trim()"
          >
            Create
          </LabButton>
        </form>
      </LabPanel>

      <LabPanel
        label="members"
        :title="current ? `Members of ${current.name}` : 'Members'"
      >
        <OrganizationBoundary>
          <template #default="{ workspace }">
            <ul class="wslist">
              <li
                v-for="entry in members"
                :key="entry.id"
                class="wsrow"
              >
                <span class="wsname">{{ entry.user?.email ?? entry.userId }}</span>
                <span class="wsbadge">{{ entry.role }}</span>
              </li>
            </ul>
            <form
              class="wsform"
              @submit.prevent="sendInvite"
            >
              <input
                v-model="inviteEmail"
                type="email"
                placeholder="teammate@example.com"
                :disabled="pending"
              >
              <LabButton
                type="submit"
                variant="ghost"
                :disabled="pending || !inviteEmail.trim()"
              >
                Invite
              </LabButton>
            </form>
            <LabButton
              v-if="member?.role !== 'owner'"
              variant="ghost"
              size="sm"
              :disabled="pending"
              @click="run(() => leave(workspace.id), 'Left the workspace.')"
            >
              Leave workspace
            </LabButton>
          </template>
          <template #fallback>
            <p class="hint">
              No active workspace — create one on the left.
            </p>
          </template>
          <template #placeholder>
            <p class="hint">
              loading…
            </p>
          </template>
        </OrganizationBoundary>
      </LabPanel>
    </div>

    <p
      v-if="notice"
      class="hint"
    >
      {{ notice }}
    </p>

    <LabPanel
      label="billing"
      title="Billing follows the workspace"
    >
      <p class="hint">
        With the default <code>billTo: 'organization'</code>, the subscription and
        credit balance on the Billing and Credits pages belong to the <em>active
          workspace</em> — switch above and watch them change. Members share the
        workspace's plan.
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.wslist { list-style: none; margin: 0 0 0.9rem; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.wsrow {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.5rem 0.7rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
}
.wsrow.active { background: var(--surface); box-shadow: var(--raise-sm); }
.wsname { flex: 1; font-size: 0.88rem; font-weight: 500; }
.wsbadge { font-family: var(--mono); font-size: 0.62rem; color: var(--accent-soft); letter-spacing: 0.05em; }
.wsform { display: flex; gap: 0.5rem; margin-bottom: 0.6rem; }
.wsform input {
  flex: 1; padding: 0.5rem 0.7rem; border: 0; border-radius: var(--r-sm);
  background: var(--sink); color: var(--ink); font: inherit; font-size: 0.88rem;
  box-shadow: var(--inset-sm);
}
.wsform input:focus { outline: none; box-shadow: var(--inset-sm), 0 0 0 2px var(--accent); }
.hint { color: var(--ink-dim); font-size: 0.82rem; line-height: 1.5; margin: 0; }
</style>
