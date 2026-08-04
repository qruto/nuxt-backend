import { defineComponent, h, onMounted, ref } from 'vue'
import { useOrganization, type InvitationDetails } from '../composables/use-organization'

type InvitationState = 'loading' | 'ready' | 'accepted' | 'declined' | 'missing' | 'error'

/**
 * Drop-in accept/decline UI for a workspace-invitation link
 * (`/accept-invitation?id=<invitationId>` — the URL invitation emails point
 * at). Loads the invitation, shows who invited the user to which workspace,
 * and offers Accept / Decline. Accepting joins the workspace and (by default)
 * makes it the active one.
 *
 * The Nuxt module registers a ready-made page rendering this component (module
 * option `invitationPage`), so most apps ship the whole flow with zero files.
 * Headless like `AuthForm`: semantic markup with `data-invitation` attributes
 * for styling, or replace any state via its slot (each receives the loaded
 * invitation and the actions).
 *
 * @example
 * ```vue
 * <AcceptInvitation @accepted="navigateTo('/')" />
 * ```
 */
export const AcceptInvitation = defineComponent({
  name: 'AcceptInvitation',
  props: {
    /** Invitation id. Defaults to the `id` query parameter of the current URL. */
    invitationId: { type: String, default: undefined },
    /** Make the joined workspace active after accepting. Default `true`. */
    activate: { type: Boolean, default: true },
  },
  emits: {
    accepted: (_invitation: InvitationDetails) => true,
    declined: (_invitation: InvitationDetails) => true,
    error: (_message: string) => true,
  },
  setup(props, { slots, emit }) {
    const organization = useOrganization()
    const state = ref<InvitationState>('loading')
    const invitation = ref<InvitationDetails | null>(null)
    const errorMessage = ref('')
    const pending = ref(false)

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
        invitation.value = await organization.getInvitation(id)
        state.value = invitation.value ? 'ready' : 'missing'
      }
      catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error)
        state.value = 'error'
        emit('error', errorMessage.value)
      }
    })

    const run = async (action: 'accept' | 'decline'): Promise<void> => {
      const current = invitation.value
      if (!current || pending.value) return
      pending.value = true
      try {
        if (action === 'accept') {
          await organization.acceptInvitation(current.id, { activate: props.activate })
          state.value = 'accepted'
          emit('accepted', current)
        }
        else {
          await organization.declineInvitation(current.id)
          state.value = 'declined'
          emit('declined', current)
        }
      }
      catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error)
        state.value = 'error'
        emit('error', errorMessage.value)
      }
      finally {
        pending.value = false
      }
    }

    const slotContext = () => ({
      invitation: invitation.value,
      accept: () => run('accept'),
      decline: () => run('decline'),
      pending: pending.value,
      error: errorMessage.value,
    })

    return () => {
      const slot = slots[state.value]
      if (slot) return slot(slotContext())
      const wrap = (children: ReturnType<typeof h>[]) => h('div', { 'data-invitation': state.value }, children)
      switch (state.value) {
        case 'loading':
          return wrap([h('p', { 'data-invitation': 'message' }, 'Loading invitation…')])
        case 'missing':
          return wrap([h('p', { 'data-invitation': 'message' }, 'This invitation link is invalid or has expired.')])
        case 'error':
          return wrap([h('p', { 'data-invitation': 'message' }, `Something went wrong: ${errorMessage.value}`)])
        case 'accepted':
          return wrap([h('p', { 'data-invitation': 'message' }, `You joined ${invitation.value?.organizationName ?? 'the workspace'}. 🎉`)])
        case 'declined':
          return wrap([h('p', { 'data-invitation': 'message' }, 'Invitation declined.')])
        case 'ready': {
          const current = invitation.value!
          return wrap([
            h('p', { 'data-invitation': 'message' }, [
              h('strong', current.inviterEmail),
              ` invited you to join `,
              h('strong', current.organizationName),
              current.role ? ` as ${current.role}.` : '.',
            ]),
            h('div', { 'data-invitation': 'actions' }, [
              h('button', {
                'data-invitation': 'accept',
                'type': 'button',
                'disabled': pending.value,
                'onClick': () => run('accept'),
              }, 'Accept invitation'),
              h('button', {
                'data-invitation': 'decline',
                'type': 'button',
                'disabled': pending.value,
                'onClick': () => run('decline'),
              }, 'Decline'),
            ]),
          ])
        }
      }
    }
  },
})
