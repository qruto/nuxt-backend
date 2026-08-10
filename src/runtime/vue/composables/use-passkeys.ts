import { computed, getCurrentInstance, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import { useAuth } from './use-auth'
import { unwrapAuth } from '../utils/auth-result'

/** A registered WebAuthn passkey (loose — the full shape is Better Auth's). */
export interface Passkey {
  id: string
  name?: string | null
  deviceType?: string
  backedUp?: boolean
  createdAt: string | Date
}

export interface UsePasskeysOptions {
  /** Load the passkey list on mount. Default `true`. */
  immediate?: boolean
}

export interface UsePasskeysReturn {
  /** The user's passkeys — `undefined` until the first (client-only) load. */
  passkeys: Ref<Passkey[] | undefined>
  /** Whether a list load is in flight. */
  isLoading: ComputedRef<boolean>
  /** Message of the last failed call; cleared when the next call starts. */
  error: Ref<string | null>
  /** Reload the list. */
  refresh: () => Promise<void>
  /** Register a passkey on this device, then reload. Throws on failure. */
  add: () => Promise<void>
  /** Rename a passkey, then reload. Throws on failure. */
  rename: (id: string, name: string) => Promise<void>
  /** Remove a passkey, then reload. Throws on failure. */
  remove: (id: string) => Promise<void>
}

/**
 * Passkey management over the Better Auth client — list, register, rename,
 * remove. Every method unwraps the client's `{ data, error }` envelope and
 * throws a plain `Error` on failure (mirrored into `error`), so callers use
 * ordinary try/catch. The list only loads in the browser (WebAuthn and the
 * session cookie live there), starting as `undefined` during SSR.
 */
export function usePasskeys(options: UsePasskeysOptions = {}): UsePasskeysReturn {
  const { client, registerPasskey } = useAuth()
  const passkeyClient = client as unknown as {
    passkey: {
      listUserPasskeys: () => Promise<unknown>
      updatePasskey: (args: { id: string, name: string }) => Promise<unknown>
      deletePasskey: (args: { id: string }) => Promise<unknown>
    }
  }

  const passkeys = ref<Passkey[] | undefined>()
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function run<T>(call: () => Promise<unknown>): Promise<T> {
    error.value = null
    try {
      return unwrapAuth<T>(await call())
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Request failed'
      throw e
    }
  }

  async function refresh() {
    loading.value = true
    try {
      passkeys.value = (await run<Passkey[]>(() => passkeyClient.passkey.listUserPasskeys())) ?? []
    }
    finally {
      loading.value = false
    }
  }

  if ((options.immediate ?? true) && getCurrentInstance()) {
    onMounted(() => refresh().catch(() => {}))
  }

  return {
    passkeys,
    isLoading: computed(() => loading.value),
    error,
    refresh,
    add: async () => {
      await run(() => registerPasskey())
      await refresh()
    },
    rename: async (id, name) => {
      await run(() => passkeyClient.passkey.updatePasskey({ id, name }))
      await refresh()
    },
    remove: async (id) => {
      await run(() => passkeyClient.passkey.deletePasskey({ id }))
      await refresh()
    },
  }
}
