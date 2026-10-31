import { shallowRef } from 'vue'
import type { AuthSession } from './auth-session'

type AuthClient = AuthSession['client']

/** A Better Auth read the client offers as a hook: `useListOrganizations`, `useActiveMember`, … */
type ReadHook = { [Name in keyof AuthClient]: Name extends `use${string}` ? Name : never }[keyof AuthClient]

/**
 * One of the auth client's reads, as a component reads it. On the server
 * Better Auth's stores never fetch, so each reads pending for the whole
 * render, and each is one store for every request: subscribing to it in a
 * scope no server render disposes kept a listener on it for good, per call.
 * A server render reads the same pending state from a ref of its own.
 */
export function useAuthRead<Name extends ReadHook>(client: AuthClient, name: Name): ReturnType<AuthClient[Name]> {
  if (import.meta.server) {
    return shallowRef({ data: null, error: null, isPending: true, isRefetching: false, refetch: async () => {} }) as never
  }
  return (client[name] as () => ReturnType<AuthClient[Name]>)()
}
