/** One strip a persona starts with, in its workspace. */
export interface TryStrip {
  idea: string
  /** `ready`: drawn with the fixture panels and announced; `queued`: waiting in line. */
  status: 'ready' | 'queued'
  /** A ready strip's captions, one per panel. */
  captions?: string[]
  /** The persona who reported it. */
  reportedBy?: string
}

/** One persona of the try kit: an account `pnpm try` seeds, and what it has. */
export interface TryPersona {
  key: string
  label: string
  name: string
  /** A sandbox identity: `delivered+<label>@resend.dev`. */
  email: string
  summary: string
  /** The app-wide role. */
  role?: 'admin'
  /** The account signs in with a passkey only. */
  passkeyOnly?: boolean
  /** The language the account reads in (`user.locale`): its emails are written in it. */
  locale?: string
  /** The name of a team workspace it owns; a personal workspace otherwise. */
  workspace?: string
  /** A member of another persona's workspace, and of none of its own. */
  joins?: { persona: string, role: 'member' | 'admin' }
  /** A catalog plan its workspace subscribes to. */
  plan?: string
  /** A credit pack its workspace bought. */
  pack?: string
  /** A gift of a pack bought for another persona, unclaimed. */
  gift?: { pack: string, to: string, message?: string }
  /** Its strips, in its workspace. */
  strips?: TryStrip[]
  /** The app's experiments its account is in. */
  experiments?: string[]
  /** Its answer to "How did you hear about us?". */
  source?: string
}

/** Every persona, in the order the guide lists them. */
export declare const PERSONAS: readonly TryPersona[]
