// The role checks the client shares: `useAuth().hasRole`, and the
// page guard (`definePageMeta({ auth })`), which reads the same role off the
// server's token before the page renders.

/** Better Auth keeps several roles in one field, comma-separated. */
function roleList(roles: string): string[] {
  return roles.split(',').map(role => role.trim()).filter(Boolean)
}

/** A user's app-wide role field: `'user'` when unset. */
export function appRole(user: object | null | undefined): string {
  const value = (user as { role?: unknown } | null | undefined)?.role
  return typeof value === 'string' && value ? value : 'user'
}

/** Whether a role field (several comma-separated, or none) holds one of `required`. */
export function hasAnyRole(roles: string | null | undefined, required: string | readonly string[]): boolean {
  const wanted = typeof required === 'string' ? [required] : required
  return roles ? roleList(roles).some(role => wanted.includes(role)) : false
}
