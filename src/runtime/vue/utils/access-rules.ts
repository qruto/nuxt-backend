// The page guard's vocabulary, with nothing to import: the module's entry
// (`nuxt-backend`) exports these types, and its declarations must resolve
// outside an app, where `#app` does not.

/**
 * Who may open a page, as `definePageMeta({ auth: { … } })` declares it.
 * A page with rules requires a sign-in, as `auth: true` does, and then every
 * rule it names: a signed-in person who fails one gets a 403, shown with
 * `<AccessDenied>`, or a 404 when the page is `hidden`. A parent page's
 * rules apply to its children too.
 *
 * The page guard is for the screen only. Every backend function the page
 * calls checks the caller again (`authed`, `workspace`, `admin`, `withRole`,
 * `withFeature`).
 */
export interface PageAccessRules {
  /** An app-wide role, or several: any one passes (`useAuth().hasRole`). */
  role?: string | readonly string[]
  /**
   * The active workspace: `true` lets in any member, a built-in role or a
   * list of them (`'owner'`, `['owner', 'admin']`) only those who hold one
   * there. Read fresh from the auth server on each guarded navigation.
   * Without an active workspace the page is refused.
   */
  workspace?: true | string | readonly string[]
  /** A feature the active workspace's plan includes, by its catalog key (`useFeatures().has`). */
  feature?: string
  /**
   * Changes no check: a person the rules refuse gets a 404 instead of the
   * 403, and a signed-out visitor one too instead of the sign-in page, so
   * the page's existence stays private.
   */
  hidden?: boolean
}

/** What `definePageMeta({ auth })` takes: `true` for a sign-in alone, or the rules. */
export type PageAuth = true | PageAccessRules

/** The rules a page can name: any other key refuses the page (a misspelled `roles` must not open it). */
export const PAGE_ACCESS_RULE_KEYS = ['role', 'workspace', 'feature', 'hidden'] as const satisfies ReadonlyArray<keyof PageAccessRules>

/** Why the page guard refused a signed-in person: the rule they failed. */
export type AccessDeniedReason = 'role' | 'workspace' | 'feature' | 'banned'

/** Every reason the page guard gives, in the order it checks them. */
export const ACCESS_DENIED_REASONS: readonly AccessDeniedReason[] = ['banned', 'role', 'workspace', 'feature']

/** What the guard's 403 carries in `error.data`. */
export interface AccessDeniedData {
  /** The rule the person failed. */
  reason: AccessDeniedReason
  /** The page they asked for, as a path of this site: where signing in as someone else returns to. */
  path: string
}
