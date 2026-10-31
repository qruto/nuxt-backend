<script setup lang="ts">
import { computed, h, onMounted, ref, shallowRef } from 'vue'
import { useLabels, valueLabel, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useWorkspace, type InvitationDetails } from '../../composables/use-workspace'
import { SingleRoot, VNodes } from '../../utils/vnodes'
import { provideInvitationLabels, type AcceptInvitationSlots, type InvitationState, type InvitationView } from './accept-invitation'

/**
 * Accept/decline UI for a workspace-invitation link
 * (`/accept-invitation?id=<invitationId>` — the URL invitation emails point
 * at). Loads the invitation, shows who invited the user to which workspace,
 * and offers Accept / Decline (`AcceptInvitationActions`). Accepting joins
 * the workspace and (by default) makes it the active one.
 *
 * The Nuxt module registers a ready-made page rendering this component
 * (module option `pages.acceptInvitation`). Markup with `data-invitation`
 * attributes, or replace any state via its slot (each receives the loaded
 * invitation and the actions).
 *
 * @example
 * ```vue
 * <AcceptInvitation @accepted="navigateTo('/')" />
 * ```
 */
defineOptions({ name: 'AcceptInvitation' })

const props = withDefaults(defineProps<{
  /** Invitation id. Defaults to the `id` query parameter of the current URL. */
  invitationId?: string
  /** Make the joined workspace active after accepting. Default `true`. */
  activate?: boolean
  /** Copy for this component, over `appConfig.backend.labels.invitation` and the translations. */
  labels?: LabelOverrides<BackendLabels['invitation']>
}>(), { invitationId: undefined, activate: true, labels: undefined })

const emit = defineEmits({
  accepted: (_invitation: InvitationDetails) => true,
  declined: (_invitation: InvitationDetails) => true,
  error: (_message: string) => true,
})
defineSlots<AcceptInvitationSlots>()

const workspace = useWorkspace()
const labels = useLabels('invitation', () => props.labels)
const { t, rich, errorMessage } = labels
provideInvitationLabels(labels)
const state = ref<InvitationState>('loading')
const invitation = ref<InvitationDetails | null>(null)
// What went wrong, worded when it renders: a locale switch rewords it.
const failed = shallowRef<unknown>(null)
const failure = computed(() => (failed.value === null ? '' : errorMessage(failed.value)))
const pending = ref(false)
// Which answer is on its way, so its button says so.
const answering = ref<'accept' | 'decline' | null>(null)

const resolveId = (): string | null => {
  if (props.invitationId) return props.invitationId
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('id')
}

onMounted(async () => {
  const id = resolveId()
  if (!id) {
    state.value = 'missing'
    return
  }
  try {
    invitation.value = await workspace.getInvitation(id)
    state.value = invitation.value ? 'ready' : 'missing'
  }
  catch (error) {
    failed.value = error
    state.value = 'error'
    emit('error', failure.value)
  }
})

async function run(action: 'accept' | 'decline'): Promise<void> {
  const current = invitation.value
  // A press while an answer is on its way does nothing; both buttons keep focus (`aria-disabled`).
  if (!current || pending.value) return
  pending.value = true
  answering.value = action
  try {
    if (action === 'accept') {
      await workspace.acceptInvitation(current.id, { activate: props.activate })
      state.value = 'accepted'
      emit('accepted', current)
    }
    else {
      await workspace.declineInvitation(current.id)
      state.value = 'declined'
      emit('declined', current)
    }
  }
  catch (error) {
    failed.value = error
    state.value = 'error'
    emit('error', failure.value)
  }
  finally {
    pending.value = false
    answering.value = null
  }
}

const context = computed<InvitationView>(() => ({
  invitation: invitation.value,
  accept: () => run('accept'),
  decline: () => run('decline'),
  isPending: pending.value,
  error: failure.value,
  answering: answering.value,
}))

/** Who invited the person to which workspace, the names in bold, in the reader's language. */
const invited = computed(() => {
  const current = invitation.value
  if (!current) return null
  const names = { inviter: h('strong', current.inviterEmail), workspace: h('strong', current.workspaceName) }
  return current.role ? rich('invitedAs', { ...names, role: valueLabel(labels, 'invitation', 'roles', current.role) }) : rich('invited', names)
})

// In the template: Every message is a live region, so a screen reader hears
// the outcome of the load and of each action without the page moving focus: a
// dead link or a failure interrupts (`alert`), everything else waits its turn
// (`status`). The wrapper reads as busy while the invitation loads and while
// an accept/decline is in flight.
</script>

<template>
  <SingleRoot>
    <slot
      :name="state"
      v-bind="context"
    >
      <div
        :data-invitation="state"
        :aria-busy="state === 'loading' || pending ? 'true' : undefined"
        :data-loading="state === 'loading' ? '' : undefined"
      >
        <p
          v-if="state === 'loading'"
          data-invitation="message"
          role="status"
          aria-live="polite"
        >
          {{ t('loading') }}
        </p>
        <p
          v-else-if="state === 'missing'"
          data-invitation="message"
          role="alert"
        >
          {{ t('missing') }}
        </p>
        <p
          v-else-if="state === 'error'"
          data-invitation="message"
          role="alert"
        >
          {{ t('failed', { message: failure }) }}
        </p>
        <p
          v-else-if="state === 'accepted'"
          data-invitation="message"
          role="status"
          aria-live="polite"
        >
          {{ t('accepted', { workspace: invitation?.workspaceName ?? t('theWorkspace') }) }}
          <!-- Decoration, not content: kept off the accessible name. -->
          <span
            data-invitation="icon"
            aria-hidden="true"
          >🎉</span>
        </p>
        <p
          v-else-if="state === 'declined'"
          data-invitation="message"
          role="status"
          aria-live="polite"
        >
          {{ t('declined') }}
        </p>
        <template v-else-if="state === 'ready'">
          <p
            data-invitation="message"
            role="status"
            aria-live="polite"
          >
            <VNodes :nodes="invited" />
          </p>
          <AcceptInvitationActions :invitation="context" />
        </template>
      </div>
    </slot>
  </SingleRoot>
</template>
