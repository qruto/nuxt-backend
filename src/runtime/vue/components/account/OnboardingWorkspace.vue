<script setup lang="ts">
import OnboardingStepActions from './OnboardingStepActions.vue'
import { computed, onMounted, ref, useId, watch } from 'vue'
import { busyAttributes } from '../../a11y'
import { useAuth } from '../../composables/use-auth'
import { type ReceivedInvitation, useWorkspace, type Workspace } from '../../composables/use-workspace'
import type { OnboardingWorkspaceProps } from '../../parts'

/**
 * `<OnboardingFlow>`'s workspace step: rename the personal workspace the
 * account starts with, or join one the person was invited to instead.
 */
defineOptions({ name: 'OnboardingWorkspace' })
const props = defineProps<OnboardingWorkspaceProps>()
const { t, errorMessage } = props.onboarding.labels
const workspace = useWorkspace()
const { user } = useAuth()
const id = useId()

// The workspace the step renames: the personal one the first sign-in made
// (slug `personal-<id>`), else the active one while the person owns it
// alone. A team's workspace they joined, active after an invitation, is
// never renamed here: the step offers no name then.
const own = computed((): Workspace | null => {
  const slug = user.value?.id ? `personal-${user.value.id.toLowerCase()}` : null
  const personal = slug ? workspace.workspaces.value.find(entry => entry.slug === slug || entry.slug.startsWith(`${slug}-`)) : undefined
  if (personal) return personal
  const active = workspace.current.value
  const owner = (workspace.role.value ?? '').split(',').some(role => role.trim() === 'owner')
  const alone = workspace.members.value.every(member => member.userId === user.value?.id)
  return active && owner && alone ? active : null
})

const name = ref(own.value?.name ?? '')
const touched = ref(false)
watch(() => own.value?.name, (now) => {
  if (!touched.value && now) name.value = now
})

// Invitations waiting for the person, read once: joining one beats naming a workspace of one's own.
const invitations = ref<ReceivedInvitation[]>([])
const message = ref('')
onMounted(async () => {
  try {
    invitations.value = (await workspace.listReceivedInvitations()).filter(invitation => invitation.status === 'pending')
  }
  catch {
    // No list, no invitations to offer: the rename still works.
    invitations.value = []
  }
})
const invitedTo = (invitation: ReceivedInvitation): string => (invitation as { workspaceName?: string }).workspaceName ?? invitation.workspaceId
const failure = computed(() => (workspace.error.value ? errorMessage(workspace.error.value) : null))
const pending = computed(() => workspace.isPending.value)

async function save(): Promise<void> {
  const next = name.value.trim()
  const target = own.value
  if (pending.value) return
  if (target && next && next !== target.name) {
    try {
      await workspace.rename(next, target.id)
    }
    catch {
      return
    }
  }
  await props.onboarding.next()
}

async function join(invitation: ReceivedInvitation): Promise<void> {
  if (pending.value) return
  try {
    await workspace.acceptInvitation(invitation.id, { activate: true })
  }
  catch {
    return
  }
  message.value = t('workspace.joined', { workspace: invitedTo(invitation) })
  invitations.value = invitations.value.filter(entry => entry.id !== invitation.id)
  await props.onboarding.next()
}

async function decline(invitation: ReceivedInvitation): Promise<void> {
  if (pending.value) return
  try {
    await workspace.declineInvitation(invitation.id)
  }
  catch {
    return
  }
  message.value = t('workspace.declined')
  invitations.value = invitations.value.filter(entry => entry.id !== invitation.id)
}
</script>

<template>
  <div data-onboarding="workspace">
    <h2
      :id="`${id}-title`"
      data-onboarding="step-title"
    >
      {{ t('workspace.heading') }}
    </h2>
    <ul
      v-if="invitations.length"
      data-onboarding="invitations"
    >
      <li
        v-for="invitation in invitations"
        :key="invitation.id"
        data-onboarding="invitation"
      >
        <p>{{ t('workspace.invitedTo', { workspace: invitedTo(invitation) }) }}</p>
        <button
          type="button"
          data-onboarding="accept"
          v-bind="busyAttributes(pending)"
          @click="join(invitation)"
        >
          {{ t('workspace.accept', { workspace: invitedTo(invitation) }) }}
        </button>
        <button
          type="button"
          data-onboarding="decline"
          v-bind="busyAttributes(pending)"
          @click="decline(invitation)"
        >
          {{ t('workspace.decline') }}
        </button>
      </li>
    </ul>
    <form
      data-onboarding="form"
      @submit.prevent="save"
    >
      <template v-if="own">
        <p data-onboarding="intro">
          {{ t('workspace.intro') }}
        </p>
        <label data-onboarding="label">
          {{ t('workspace.name') }}
          <input
            v-model="name"
            data-onboarding="input-workspace"
            type="text"
            maxlength="100"
            autocomplete="organization"
            @input="touched = true"
          >
        </label>
      </template>
      <p
        v-if="failure"
        data-onboarding="error"
        role="alert"
      >
        {{ failure }}
      </p>
      <OnboardingStepActions
        :onboarding="onboarding"
        submit
        :pending="pending"
      />
    </form>
    <p
      role="status"
      aria-live="polite"
      data-onboarding="status"
    >
      {{ message }}
    </p>
  </div>
</template>
