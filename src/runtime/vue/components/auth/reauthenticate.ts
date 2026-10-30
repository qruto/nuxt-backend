import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { UseLabelsReturn } from '../../composables/use-labels'
import type { UseReauthenticationReturn } from '../../composables/use-reauthentication'

/**
 * `<ReauthenticateDialog>`'s slots. Each receives the app's
 * re-authentication (`UseReauthenticationReturn`), so a custom step drives
 * the same refs and actions the built-in markup does.
 */
export interface ReauthenticateDialogSlots {
  /** The first step: the passkey button and "Email me a code". */
  'choose': (flow: UseReauthenticationReturn) => unknown
  /** The code form. */
  'verify-code': (flow: UseReauthenticationReturn) => unknown
  /** Why the last step failed; rendered only while `error` is set. */
  'error': (flow: UseReauthenticationReturn) => unknown
  /** Below the steps, beside "Cancel". */
  'footer': (flow: UseReauthenticationReturn) => unknown
}

/** What the dialog hands its packaged parts beside the `flow` prop. */
export interface ReauthenticateView {
  labels: UseLabelsReturn<'reauthenticate'>
  /** Whether this browser can run a passkey ceremony; `null` until mounted. */
  passkeys: Ref<boolean | null>
  /** A press while a step runs does nothing: the busy button keeps focus. */
  byPerson: (action: () => Promise<void> | void) => () => void
  sentId: string
  errorId: string
  /** Whether the dialog's own error element is on the page, to describe a refused code. */
  describesError: () => boolean
  errorText: ComputedRef<string | null>
}

const REAUTHENTICATE_VIEW: InjectionKey<ReauthenticateView> = Symbol('nuxt-backend:reauthenticate')

/** @internal */
export function provideReauthenticateView(view: ReauthenticateView): void {
  provide(REAUTHENTICATE_VIEW, view)
}

/** @internal */
export function useReauthenticateView(part: string): ReauthenticateView {
  const view = inject(REAUTHENTICATE_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <ReauthenticateDialog>, which gives it the re-authentication. To build one of your own, use useReauthentication().`)
  return view
}
