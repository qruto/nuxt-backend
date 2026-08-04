export const DEFAULT_AUTH_ROUTE = '/api/auth'
export const COMPONENT_AUTH_ROUTE = '/'
/**
 * App page that handles workspace-invitation accept links
 * (`{SITE_URL}{path}?id=<invitationId>`). The Nuxt module registers this page
 * automatically (module option `invitationPage`); the Convex side builds the
 * emailed URL from the same constant (`organization.invitationPath`).
 */
export const DEFAULT_INVITATION_PATH = '/accept-invitation'
