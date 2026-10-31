import { inject, provide, type InjectionKey } from 'vue'
import type { UseLabelsReturn } from '../../composables/use-labels'
import type { InvitationDetails } from '../../composables/use-workspace'

export type InvitationState = 'loading' | 'ready' | 'accepted' | 'declined' | 'missing' | 'error'

/** What each of `<AcceptInvitation>`'s slots receives. */
export interface InvitationSlotContext {
  /** The invitation, once loaded. */
  invitation: InvitationDetails | null
  accept: () => Promise<void>
  decline: () => Promise<void>
  /** Whether an answer is on its way. */
  isPending: boolean
  /** Why loading or answering failed, worded; empty otherwise. */
  error: string
}

/** What `AcceptInvitationActions` receives as `invitation`: the slot context, and which answer is on its way. */
export interface InvitationView extends InvitationSlotContext {
  answering: 'accept' | 'decline' | null
}

/** `<AcceptInvitation>`'s slots: one per state, each replacing that state's markup. */
export type AcceptInvitationSlots = { [State in InvitationState]: (context: InvitationSlotContext) => unknown }

const INVITATION_LABELS: InjectionKey<UseLabelsReturn<'invitation'>> = Symbol('nuxt-backend:invitation')

/** @internal */
export function provideInvitationLabels(labels: UseLabelsReturn<'invitation'>): void {
  provide(INVITATION_LABELS, labels)
}

/** @internal */
export function useInvitationLabels(part: string): UseLabelsReturn<'invitation'> {
  const labels = inject(INVITATION_LABELS, null)
  if (!labels) throw new Error(`[nuxt-backend] <${part}> renders inside <AcceptInvitation>. To build one of your own, use useWorkspace().`)
  return labels
}
