import { type AuthLibrarySecretConfig, contextSecrets } from '../auth-secrets.js'
import type { DefaultAuthPlugin } from './plugins.js'

// While `nuxt-backend env rotate AUTH_SECRET` keeps a previous secret, the
// session cookie a browser holds (and the session token a client sends as a
// Bearer token) may still carry a signature made with it. The auth library
// checks a signed cookie against its current secret only, so this plugin
// re-signs such a value with the current secret before the request is
// handled: nobody is signed out, and the next session refresh writes a
// cookie signed with the current secret.

const encoder = new TextEncoder()

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

/** A signed value's signature, as the auth library writes it: base64 of HMAC-SHA-256. */
async function signatureOf(value: string, secret: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(value)))
  let binary = ''
  for (const byte of mac) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function signedWith(signature: string, value: string, secret: string): Promise<boolean> {
  try {
    const bytes = Uint8Array.from(atob(signature), char => char.charCodeAt(0))
    return await crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, encoder.encode(value))
  }
  catch {
    return false
  }
}

function decoded(raw: string): string | null {
  try {
    return decodeURIComponent(raw)
  }
  catch {
    return null
  }
}

/**
 * A signed value (`<value>.<signature>`, URL-encoded or not) re-signed with
 * `current` when a previous secret signed it; `null` when it is no signed
 * value, the current secret signed it, or no live secret did.
 */
export async function resignedValue(raw: string, [current, ...previous]: readonly string[]): Promise<string | null> {
  const value = raw.includes('%') ? decoded(raw) : raw
  if (!value || !current || previous.length === 0) return null
  const dot = value.lastIndexOf('.')
  if (dot < 1) return null
  const signed = value.slice(0, dot)
  const signature = value.slice(dot + 1)
  if (signature.length !== 44 || !signature.endsWith('=')) return null
  if (await signedWith(signature, signed, current)) return null
  for (const secret of previous) {
    if (await signedWith(signature, signed, secret)) return encodeURIComponent(`${signed}.${await signatureOf(signed, current)}`)
  }
  return null
}

/** The `Cookie` header with every value a previous secret signed re-signed, or `null` when none was. */
async function resignedCookies(header: string, secrets: readonly string[]): Promise<string | null> {
  let changed = false
  const pairs = await Promise.all(header.split(/;\s*/).map(async (pair) => {
    const eq = pair.indexOf('=')
    if (eq < 1) return pair
    const resigned = await resignedValue(pair.slice(eq + 1), secrets)
    if (resigned === null) return pair
    changed = true
    return `${pair.slice(0, eq)}=${resigned}`
  }))
  return changed ? pairs.join('; ') : null
}

/** The plugin's id: the component adapter lists it too, so both plugin sets stay one. */
export const SECRET_ROTATION_PLUGIN_ID = 'nuxt-backend-secret-rotation'

/**
 * The plugin that keeps sessions signed before a rotation working until the
 * previous secret retires. It does nothing while `AUTH_SECRET` holds one
 * secret.
 */
export function secretRotationPlugin(): DefaultAuthPlugin {
  return {
    id: SECRET_ROTATION_PLUGIN_ID,
    async onRequest(request: Request, context: { secret: string, secretConfig?: AuthLibrarySecretConfig }) {
      const secrets = contextSecrets(context)
      if (secrets.length < 2) return
      const headers = new Headers(request.headers)
      let changed = false
      const cookie = request.headers.get('cookie')
      const cookies = cookie ? await resignedCookies(cookie, secrets) : null
      if (cookies !== null) {
        headers.set('cookie', cookies)
        changed = true
      }
      const authorization = request.headers.get('authorization')
      if (authorization && authorization.slice(0, 7).toLowerCase() === 'bearer ') {
        const resigned = await resignedValue(authorization.slice(7).trim(), secrets)
        if (resigned !== null) {
          headers.set('authorization', `Bearer ${resigned}`)
          changed = true
        }
      }
      if (!changed) return
      return { request: new Request(request, { headers }) }
    },
  } as unknown as DefaultAuthPlugin
}
