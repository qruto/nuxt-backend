import { loadAuthClient } from 'nuxt-convex-module/better-auth/client'
import { preloadPasskeyCeremony } from '../passkey-ceremony'

// Apart from ../passkey-ceremony.ts, which the passkey client plugin imports:
// the auth client's own module must not import the base module's entry back.

/**
 * Get the page ready for a passkey prompt: the ceremony, and the auth client
 * the base module loads on first use, both loaded before the tap. A tap's
 * sign-in or registration then starts its options request in the tap's own
 * task, with nothing awaited first (WebKit opens the prompt only while the
 * tap's activation lasts; ../passkey-client.ts). `<AuthForm>` and
 * `usePasskeys` call it on mount, the reauthentication dialog when it opens.
 * The idle plugin loads the ceremony alone, so a page with no passkey form
 * never downloads the client for it. A failed load is left for the tap,
 * which loads again.
 */
export function preparePasskeyPrompt(): void {
  preloadPasskeyCeremony()
  if (typeof window === 'undefined') return
  loadAuthClient().catch(() => {})
}
