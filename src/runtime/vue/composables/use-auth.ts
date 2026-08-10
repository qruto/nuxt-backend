import { computed, type ComputedRef } from 'vue'
import { useAuth as useBaseAuth, type UseAuthService } from 'nuxt-convex-module/better-auth/client'

/**
 * The backend identity service: the base Convex + Better Auth service
 * extended with this package's passwordless flows and authorization reads.
 */
export interface UseBackendAuthService extends UseAuthService {
  // ── Passwordless flows (OTP + passkeys) ────────────────────────────────
  /** Sign the current user out. */
  signOut: () => Promise<unknown>
  /** Send a sign-in / verification OTP code to an email. */
  sendOtp: (email: string, type?: 'sign-in' | 'email-verification' | 'forget-password') => Promise<unknown>
  /** Complete sign-in (or passwordless sign-up) with an emailed OTP code. */
  signInWithOtp: (args: { email: string, otp: string, name?: string }) => Promise<unknown>
  /** Sign in with a passkey (WebAuthn). */
  signInWithPasskey: () => Promise<unknown>
  /** Register a passkey — pass `{ email, name }` (JSON) for pre-auth registration. */
  registerPasskey: (context?: string) => Promise<unknown>
  // ── Account management ─────────────────────────────────────────────────
  /** Update profile fields (name / avatar image) on the current user. */
  updateUser: (args: { name?: string, image?: string | null }) => Promise<unknown>
  /** Change the account email (confirmed via email). */
  changeEmail: (newEmail: string, callbackURL?: string) => Promise<unknown>
  /**
   * Send an email-verification link to the current address. The endpoint
   * throws for already-verified users — gate on `user.emailVerified`.
   */
  sendVerificationEmail: (callbackURL?: string) => Promise<unknown>
  /** Delete the account (confirmed via email). */
  deleteAccount: () => Promise<unknown>
  // ── Authorization (admin plugin) ───────────────────────────────────────
  /** The app-wide role; `'user'` when signed out or unset. */
  role: ComputedRef<string>
  /** Whether the user has (any of) the given app-wide role(s). */
  hasRole: (role: string | string[]) => boolean
  /** Check permission statements (e.g. `{ user: ['ban'] }`) against the user's role — sync and local. */
  can: (permissions: Record<string, string[]>) => boolean
  /** Whether the account is banned. */
  banned: ComputedRef<boolean>
}

/**
 * The backend identity composable — the base Better Auth service
 * (`isLoading`, `isAuthenticated`, `fetchAccessToken`, `client`, `session`,
 * `user`, `authVersion`) extended with the passwordless flows and
 * authorization reads this package is opinionated about. Everything else
 * (admin/organization management, …) lives on the fully-typed `client`.
 *
 * Registered with import priority over the base module's `useAuth`, so this
 * is what `useAuth()` resolves to in apps using `nuxt-backend`.
 *
 * @param initialToken - Optional preloaded token (SSR), forwarded to the base.
 */
export function useAuth(initialToken?: string | null): UseBackendAuthService {
  const base = useBaseAuth(initialToken)

  // Thin ergonomic wrappers over the Better Auth client — the client is fully
  // typed and remains exposed for everything else; these cover the common flows.
  const client = base.client as unknown as {
    signOut: () => Promise<unknown>
    emailOtp: { sendVerificationOtp: (args: { email: string, type: string }) => Promise<unknown> }
    signIn: {
      emailOtp: (args: { email: string, otp: string, name?: string }) => Promise<unknown>
      passkey: () => Promise<unknown>
    }
    passkey: { addPasskey: (args: { context?: string }) => Promise<unknown> }
    updateUser: (args: { name?: string, image?: string | null }) => Promise<unknown>
    changeEmail: (args: { newEmail: string, callbackURL?: string }) => Promise<unknown>
    sendVerificationEmail: (args: { email: string, callbackURL?: string }) => Promise<unknown>
    deleteUser: (args: Record<string, never>) => Promise<unknown>
    admin: { checkRolePermission: (args: { permissions: Record<string, string[]>, role: string }) => boolean }
  }

  const role = computed<string>(() => {
    const value = base.user.value?.role
    return typeof value === 'string' && value ? value : 'user'
  })
  const roles = () => role.value.split(',').map(entry => entry.trim())

  return {
    ...base,
    signOut: () => client.signOut(),
    sendOtp: (email, type = 'sign-in') => client.emailOtp.sendVerificationOtp({ email, type }),
    signInWithOtp: args => client.signIn.emailOtp(args),
    signInWithPasskey: () => client.signIn.passkey(),
    registerPasskey: context => client.passkey.addPasskey({ context }),
    updateUser: args => client.updateUser(args),
    changeEmail: (newEmail, callbackURL) => client.changeEmail({ newEmail, callbackURL }),
    sendVerificationEmail: (callbackURL) => {
      const email = base.user.value?.email
      if (!email) return Promise.reject(new Error('No signed-in user to verify'))
      return client.sendVerificationEmail({ email, callbackURL })
    },
    deleteAccount: () => client.deleteUser({}),
    role,
    hasRole: (required) => {
      const requiredRoles = Array.isArray(required) ? required : [required]
      const userRoles = roles()
      return requiredRoles.some(entry => userRoles.includes(entry))
    },
    can: permissions => roles().some(entry =>
      client.admin.checkRolePermission({ permissions, role: entry })),
    banned: computed(() => base.user.value?.banned === true),
  }
}
