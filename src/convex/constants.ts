export const DEFAULT_AUTH_ROUTE = '/api/auth'
export const COMPONENT_AUTH_ROUTE = '/'
/**
 * App page that handles workspace-invitation accept links
 * (`{SITE_URL}{path}?id=<invitationId>`). The Nuxt module registers this page
 * automatically (module option `pages.acceptInvitation`); the Convex side builds the
 * emailed URL from the same constant (`organization.invitationPath`).
 */
export const DEFAULT_INVITATION_PATH = '/accept-invitation'
/**
 * Default paths of the module-mounted pages (module option `pages`). Shared
 * Nuxt↔Convex constants — the login path is also the auth middleware's
 * redirect target, and settings/security paths are natural email
 * `callbackURL` defaults.
 */
export const DEFAULT_LOGIN_PATH = '/login'
export const DEFAULT_PRICING_PATH = '/pricing'
export const DEFAULT_SETTINGS_PATH = '/settings'
export const DEFAULT_PROFILE_PATH = '/profile'
export const DEFAULT_SECURITY_PATH = '/security'
