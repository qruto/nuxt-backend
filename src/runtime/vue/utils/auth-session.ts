import { computed, type ComputedRef } from 'vue'
import { useBetterAuth as useBaseAuth, type BetterAuthUser, type UseBetterAuthReturn } from 'nuxt-convex-module/better-auth/client'
import { AUTOFILL_FIELD, canAutofillPasskeys } from '../passkey-client'
import { unwrapAuth } from './auth-result'
import { signInMethod, useLastSignInState } from './last-sign-in'
import { markLocalSignOut, sessionKey } from './local-sign-out'
import { useActionState } from './action-state'
import type { BackendError } from './backend-error'
import { appRole, hasAnyRole } from './roles'
import { credentialIdOf, signalUnknownCredential, signalUserDetails } from './passkey-signals'

/**
 * The request option that names the reader's language, `Accept-Language`,
 * which the backend reads for a new account and its code; no option at all
 * without one, so the browser's own header goes.
 */
function inLanguage(locale: string | undefined): [] | [{ headers: Record<string, string> }] {
  return locale ? [{ headers: { 'accept-language': locale } }] : []
}

/** Which code `sendOtp` asks for. `'forget-password'` answers 400 unless the app turned on `emailAndPassword`. */
export type OtpType = 'sign-in' | 'email-verification' | 'forget-password'

/** How a person signs in: with a passkey, or with a code from their inbox. */
export type SignInMethod = 'passkey' | 'email-otp'

/** How `signInWithPasskey` asks for a passkey. */
export interface SignInWithPasskeyOptions {
  /**
   * Offer this browser's saved passkeys in the autofill of the page's
   * sign-in field (WebAuthn conditional mediation) instead of opening the
   * passkey prompt: the field's `autocomplete` must end in `webauthn`
   * (`username webauthn`). The call waits, outside `isPending` and leaving
   * `error` as it was, until the person picks a passkey there, and resolves
   * with the signed-in user. It resolves with `null`, asking nothing of the
   * server, where the browser cannot offer passkeys this way or the page has
   * no such field. It also resolves with `null` when the offer ends before
   * anyone picked a passkey: a passkey prompt opened in its place, or no
   * challenge could be had (refused, rate-limited, the server or the
   * network down, the ceremony unable to load or start). It rejects once
   * the person picked one that does not sign them in: refused, its
   * challenge expired (`CHALLENGE_NOT_FOUND`), or the answer lost on the way.
   * A challenge lasts five minutes; a page that keeps an offer open longer
   * asks again (`useLoginFlow` does).
   */
  autoFill?: boolean
}

/** A registered passkey, as `registerPasskey` and `usePasskeys` hand it back (loose — the full shape is Better Auth's). */
export interface Passkey {
  id: string
  /** The WebAuthn credential id, base64url: what the browser knows the passkey by. */
  credentialID?: string
  name?: string | null
  deviceType?: string
  backedUp?: boolean
  createdAt: string | Date
}

/** How `registerPasskey` saves a passkey: Better Auth's own `addPasskey` options. */
export interface RegisterPasskeyOptions {
  /** The name the passkey is listed under. */
  name?: string
  /** Where the passkey may live: this device (`platform`), a security key (`cross-platform`), or either (left out). */
  authenticatorAttachment?: 'platform' | 'cross-platform'
  /** Try to save one silently, with the password manager the person just signed in with. */
  useAutoRegister?: boolean
  /** WebAuthn extensions for the ceremony. */
  extensions?: AuthenticationExtensionsClientInputs
  /** Context for a passkey-first registration flow. */
  context?: string | null
}

/**
 * The package's own view of the session: the base module's (`user`,
 * `isAuthenticated`, `isLoading`, the Better Auth `client`, …) with the
 * passwordless actions the packaged composables and components are built
 * on. Internal: apps read the session with `useAuth`, sign in with
 * `useLoginFlow`, manage passkeys with `usePasskeys`, the account with
 * `useAccount` and a visit with `useAdmin`.
 *
 * @internal
 */
export interface AuthSession extends UseBetterAuthReturn {
  /** `true` while one of this call's actions runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, or `null`. The next action clears it, and so does signing out. */
  error: ComputedRef<BackendError | null>
  // ── Passwordless flows (OTP + passkeys) ────────────────────────────────
  /**
   * Sign the current user out. Rejects on failure. The app navigates after
   * it on its own: a sign-out made here never sends the person to the
   * sign-in page with `?redirect=`, as a session that ends elsewhere does.
   */
  signOut: () => Promise<void>
  /**
   * Email a code to `email`. Rejects on failure; a rate limit carries
   * `retryAfter`. `locale` is the language the code is written in for an
   * address without an account (sent as `Accept-Language`; the browser's
   * own without it). An account's code is written in its own language.
   */
  sendOtp: (email: string, type?: OtpType, options?: { locale?: string }) => Promise<void>
  /**
   * Sign in (or sign up, passwordless) with an emailed code. Resolves with
   * the signed-in user; rejects on failure. A new account reads in `locale`
   * (sent as `Accept-Language`; the browser's own without it): every email
   * it gets is written in it. `inviteCode` hands over the invite code or
   * access link token that admits a new address while the app is closed.
   */
  signInWithOtp: (args: { email: string, otp: string, name?: string, locale?: string, inviteCode?: string, waitlistJoin?: string, age?: number }) => Promise<BetterAuthUser>
  /**
   * Sign in with a passkey on this device. Resolves with the signed-in user;
   * rejects on failure, a cancelled prompt included. With `{ autoFill: true }`
   * it offers the passkeys in the page's sign-in field instead, and resolves
   * with `null` when there is nothing to offer them in (see
   * {@link SignInWithPasskeyOptions.autoFill}).
   */
  signInWithPasskey: {
    (options?: SignInWithPasskeyOptions & { autoFill?: false }): Promise<BetterAuthUser>
    (options: SignInWithPasskeyOptions): Promise<BetterAuthUser | null>
  }
  /** Save a passkey on this device for the signed-in user. Resolves with the passkey; rejects on failure. */
  registerPasskey: (options?: RegisterPasskeyOptions) => Promise<Passkey>
  /**
   * Sign a passkey-only account in with its recovery code: a session that
   * may only save a passkey, and the new recovery code that replaces the
   * used one. Rejects on failure (`invalid_input` on `recoveryCode`).
   */
  signInWithRecoveryCode: (args: { email: string, recoveryCode: string }) => Promise<{ recoveryCode: string }>
  /**
   * Turn sign-in codes off for the account (`true`, which needs a passkey
   * and answers a new recovery code) or on again (`false`, answering
   * `null`). Needs a recent sign-in; rejects on failure.
   */
  setPasskeyOnly: (on: boolean) => Promise<{ recoveryCode: string | null }>
  /**
   * How the person last signed in on this browser — `'passkey'` or
   * `'email-otp'` — from the cookie every sign-in sets for 30 days; else,
   * once signed in, how the account last signed in anywhere; else `null`.
   * The server render reads the same cookie, so a page that shows it renders
   * the same on both sides. Signing out keeps it: it is what the sign-in
   * form marks "Last used".
   */
  lastSignInMethod: ComputedRef<SignInMethod | null>
  // ── Account management ─────────────────────────────────────────────────
  /**
   * Update profile fields on the current user: the name, the avatar image,
   * and `locale`, the language every email the package sends them is
   * written in (a language tag such as `de` or `pt-BR`; refused otherwise).
   * Rejects on failure.
   */
  updateUser: (args: { name?: string, image?: string | null, locale?: string }) => Promise<void>
  /**
   * Delete the account now, and with it everything the app keeps of it:
   * `confirmation` is the account's address as the person typed it to
   * confirm (`invalid_input`, field `confirmation`, when it differs). It
   * takes a recent sign-in (wrap it in `useReauthentication().withReauthentication`),
   * never an administrator's visit, and is refused to the only owner of a
   * workspace others belong to (`forbidden`, reason `sole_owner`).
   * Rejects on failure. `useAccount` and `<AccountData>` hold the
   * whole flow. To change the email address, use `useEmailChange`.
   */
  deleteAccount: (confirmation: string) => Promise<void>
  // ── Authorization (admin plugin) ───────────────────────────────────────
  /** The app-wide role; `'user'` when signed out or unset. */
  role: ComputedRef<string>
  /** Whether the user has (any of) the given app-wide role(s). */
  hasRole: (role: string | string[]) => boolean
  /** Whether the account is banned. */
  banned: ComputedRef<boolean>
  // ── An administrator's visit ───────────────────────────────────────────
  /**
   * `true` while this session is an administrator acting as the account
   * (Better Auth's impersonation): `user` is the account visited, and
   * every sensitive action is refused. The impersonation notice of
   * `<BackendNotices>` says so on every page.
   */
  isImpersonating: ComputedRef<boolean>
  /** The administrator's account id behind the visit, or `null` for a person's own session. */
  impersonatedBy: ComputedRef<string | null>
  /**
   * End the visit and go back to the administrator's own session. Resolves
   * once the session is theirs again; rejects on failure, which `error`
   * keeps. Reload or navigate after it: every live query re-reads as the
   * administrator.
   */
  stopImpersonating: () => Promise<void>
}

/** The account a sign-in answer carries. */
function signedInUser(data: unknown): BetterAuthUser {
  return (data as { user: BetterAuthUser }).user
}

/**
 * The ends of an autofill offer that are no news even to a developer: a
 * passkey prompt that took its place, and a server turning challenges away
 * for a while (`rate_limited`).
 */
const EXPECTED_AUTOFILL_ENDS = ['ERROR_CEREMONY_ABORTED', 'rate_limited']

/**
 * Remember the passkey a sign-in answers with, and tell the browser when the
 * server does not know it (`PASSKEY_NOT_FOUND`: removed from the account,
 * still on the device), so the device stops offering it
 * (`signalUnknownCredential`).
 */
function passkeyAnswer() {
  let credentialId: string | null = null
  return {
    fetchOptions: {
      onRequest: (context?: { body?: unknown }) => {
        credentialId = credentialIdOf(context?.body)
      },
    },
    refused: async (answer: { error?: { code?: unknown } | null }) => {
      if (answer?.error?.code === 'PASSKEY_NOT_FOUND' && credentialId) await signalUnknownCredential(credentialId)
    },
  }
}

/**
 * A passkey sign-in through the browser's autofill: the user once the person
 * picked a passkey and the server signed them in, `null` when there was
 * nothing to offer one in or the offer ended before anyone picked one.
 *
 * The answer's request is the pick: Better Auth sends `fetchOptions` with it
 * alone. Everything before it ends quietly, since the person asked for
 * nothing yet: a challenge the server refused or could not issue, a
 * ceremony that could not load or start (a relying party that does not
 * match the page), a prompt that took its place. The field simply offers no
 * passkey, and development logs the unexpected ones. Everything after it
 * rejects: the person acted, and hears why.
 */
async function autofillSignIn(client: UseBetterAuthReturn['client']): Promise<BetterAuthUser | null> {
  if (!await canAutofillPasskeys()) return null
  if (!document.querySelector(AUTOFILL_FIELD)) {
    if (import.meta.dev) console.warn('[nuxt-backend] signInWithPasskey({ autoFill: true }) found no input whose autocomplete ends in "webauthn" (autocomplete="username webauthn"): no passkey is offered.')
    return null
  }
  let picked = false
  const watch = passkeyAnswer()
  const answer = await client.signIn.passkey({
    autoFill: true,
    fetchOptions: {
      onRequest: (context) => {
        picked = true
        watch.fetchOptions.onRequest(context)
      },
    },
  }) as { error?: { code?: unknown } | null }
  const error = answer?.error
  if (!error) return signedInUser(unwrapAuth(answer))
  await watch.refused(answer)
  if (!picked) {
    if (import.meta.dev && !EXPECTED_AUTOFILL_ENDS.includes(error.code as string)) console.warn('[nuxt-backend] The passkey autofill offer ended before a passkey was picked, so the field offers none:', error)
    return null
  }
  // Better Auth answers `AUTH_CANCELLED` when the answer's request itself
  // failed (the network dropped it): nothing the person cancelled, but a
  // passkey that did not sign them in.
  return signedInUser(unwrapAuth(error.code === 'AUTH_CANCELLED' ? { error: { ...error, code: 'AUTHENTICATION_FAILED' } } : answer))
}

/**
 * The session with the package's passwordless actions, for the packaged
 * composables and components. Every action resolves with its data, or
 * rejects and keeps the failure in `error`: the auth client answers a
 * refusal with `{ data, error }` instead of throwing, and these unwrap it
 * into an `Error` that carries the server's message, with the client's
 * error as its `cause` (what `getBackendError` reads).
 *
 * @internal
 */
export function useAuthSession(): AuthSession {
  const base = useBaseAuth()
  const { client } = base
  const { isPending, failure, run } = useActionState(() => !base.isLoading.value && !base.isAuthenticated.value)
  const lastMethod = useLastSignInState()
  /** Record how this browser just signed in, as the cookie the answer set says. */
  const signedInWith = (method: SignInMethod) => (user: BetterAuthUser): BetterAuthUser => {
    lastMethod.value = method
    return user
  }
  const signInWithPasskey = ((options?: SignInWithPasskeyOptions) => options?.autoFill
    ? run(async () => {
        const user = await autofillSignIn(client)
        return user && signedInWith('passkey')(user)
      }, { background: true })
    // The prompt's own path: nothing awaited before the options request
    // (passkey-client.ts says why).
    : run(async () => {
        const watch = passkeyAnswer()
        const answer = await client.signIn.passkey({ fetchOptions: watch.fetchOptions })
        await watch.refused(answer as { error?: { code?: unknown } | null })
        return signedInWith('passkey')(signedInUser(unwrapAuth(answer)))
      })) as AuthSession['signInWithPasskey']

  const role = computed<string>(() => appRole(base.user.value))
  const impersonatedBy = computed<string | null>(() => {
    const by = (base.session.value.data?.session as { impersonatedBy?: unknown } | undefined)?.impersonatedBy
    return typeof by === 'string' && by ? by : null
  })

  return {
    ...base,
    isPending,
    error: computed(() => failure.value),
    signOut: () => run(async () => {
      markLocalSignOut(sessionKey(base.session.value.data))
      try {
        unwrapAuth(await client.signOut())
      }
      catch (cause) {
        markLocalSignOut(null)
        throw cause
      }
    }),
    sendOtp: (email, type = 'sign-in', { locale } = {}) => run(async () => {
      unwrapAuth(await client.emailOtp.sendVerificationOtp({ email, type }, ...inLanguage(locale)))
    }),
    signInWithOtp: ({ locale, ...args }) => run(async () => signedInWith('email-otp')(signedInUser(unwrapAuth(await client.signIn.emailOtp(args, ...inLanguage(locale)))))),
    signInWithPasskey,
    registerPasskey: options => run(async () => unwrapAuth<Passkey>(await client.passkey.addPasskey({ ...options }))),
    // The package's own routes (passkey-only.ts on the server), through the client's fetch.
    signInWithRecoveryCode: args => run(async () => {
      const { recoveryCode } = unwrapAuth<{ recoveryCode: string }>(await client.$fetch('/sign-in/recovery-code', { method: 'POST', body: args }))
      return { recoveryCode }
    }),
    setPasskeyOnly: on => run(async () => unwrapAuth<{ recoveryCode: string | null }>(await client.$fetch('/passkey-only/set', { method: 'POST', body: { enabled: on } }))),
    lastSignInMethod: computed(() => lastMethod.value ?? signInMethod(base.user.value?.lastLoginMethod)),
    updateUser: args => run(async () => {
      unwrapAuth(await client.updateUser(args))
      // A new name reaches the passkeys on this device (the WebAuthn Signal API).
      const user = base.user.value
      if (user && typeof args.name === 'string') void signalUserDetails({ id: user.id, email: user.email, name: args.name })
    }),
    deleteAccount: confirmation => run(async () => {
      // The typed confirmation rides in the body, where the request guard checks it; the client's own type names only Better Auth's fields.
      unwrapAuth(await client.deleteUser({ confirmation } as Parameters<typeof client.deleteUser>[0]))
    }),
    role,
    hasRole: required => hasAnyRole(role.value, required),
    banned: computed(() => base.user.value?.banned === true),
    isImpersonating: computed(() => impersonatedBy.value !== null),
    impersonatedBy,
    stopImpersonating: () => run(async () => {
      unwrapAuth(await client.admin.stopImpersonating())
    }),
  }
}
