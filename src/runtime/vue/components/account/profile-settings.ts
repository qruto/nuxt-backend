import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { UseEmailChangeReturn } from '../../composables/use-email-change'
import type { UseEmailPreferencesReturn } from '../../composables/use-email-preferences'
import type { UseLabelsReturn } from '../../composables/use-labels'
import type { AppLanguage } from '../../utils/active-locale'
import type { SettingsMessage } from '../../utils/settings-message'

export interface ProfileSlotContext {
  user: Record<string, unknown> | null | undefined
  role: string
  workspaceName: string | null
  initials: string
  name: Ref<string>
  message: SettingsMessage | null
  savingName: boolean
  saveName: () => Promise<void>
  /** The email change, by code at both addresses (see `useEmailChange`). */
  emailChange: UseEmailChangeReturn
  /** The email topics the person receives (see `useEmailPreferences`). */
  preferences: UseEmailPreferencesReturn
  /** The languages the app is offered in (`@nuxtjs/i18n`'s locales); empty without it. */
  languages: AppLanguage[]
  /**
   * The person's language, as the app lists it: the account's
   * (`user.locale`, which their emails are written in), else the app's
   * active one for an account without one the app offers.
   */
  language: string | undefined
  /**
   * Store a language on the account (when it differs from the stored one,
   * even when the app shows it already), then switch the app to it.
   * Resolves once both are done; a failure shows in `message`.
   */
  selectLanguage: (code: string) => Promise<void>
}

/** `<ProfileSettings>`'s slots, one per region; each receives {@link ProfileSlotContext}. */
export interface ProfileSettingsSlots {
  /** The avatar, name, address and badges. */
  identity: (context: ProfileSlotContext) => unknown
  /** The display-name form. */
  name: (context: ProfileSlotContext) => unknown
  /** The email change, at every step. */
  email: (context: ProfileSlotContext) => unknown
  /** The language picker, shown when the app is offered in two languages or more. */
  language: (context: ProfileSlotContext) => unknown
  /** The Email section: the email topics the person receives, shown when the app declares topics. */
  preferences: (context: ProfileSlotContext) => unknown
  /** Below everything. */
  footer: (context: ProfileSlotContext) => unknown
}

/** What `<ProfileSettings>` hands its packaged parts beside their props. */
export interface ProfileView {
  labels: UseLabelsReturn<'profile'>
  /** Everything a slot receives. */
  context: ComputedRef<ProfileSlotContext>
  /** Whether the component is mounted: the identity renders client-side only. */
  mounted: Ref<boolean>
  /** A unique prefix for ids. */
  id: string
  /** The id of the message a refused field is described by. */
  messageId: string
  /** The email change's actions as the person runs them: a press while a step runs does nothing. */
  startChange: () => Promise<void>
  confirmCurrent: () => Promise<void>
  verifyNew: () => Promise<void>
  cancelChange: () => Promise<void>
  /** The attributes of the field a refusal may name: invalid, and described by the hint and the message. */
  fieldState: (field: string, describedBy: string) => Record<string, string | undefined>
}

const PROFILE_VIEW: InjectionKey<ProfileView> = Symbol('nuxt-backend:profile')

/** @internal */
export function provideProfileView(view: ProfileView): void {
  provide(PROFILE_VIEW, view)
}

/** @internal */
export function useProfileView(part: string): ProfileView {
  const view = inject(PROFILE_VIEW, null)
  if (!view) throw new Error(`[nuxt-backend] <${part}> renders inside <ProfileSettings>. To build a profile of your own, use useAccount() and useEmailChange().`)
  return view
}
