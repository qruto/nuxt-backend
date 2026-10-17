import { ref, watchEffect } from 'vue'
import { useEmailStatus, type UseEmailStatusReturn } from '../vue/composables/use-email-status'
import { useGifts, type UseGiftsReturn } from '../vue/composables/use-gifts'
import { usePasskeys, type UsePasskeysReturn } from '../vue/composables/use-passkeys'
import { describeUserAgent, useSessions, type UseSessionsReturn } from '../vue/composables/use-sessions'
import type { BackendDevtoolsBridgeHost, DevtoolsBridgeRequests, DevtoolsOnDemandSection } from './types'

type Patch = BackendDevtoolsBridgeHost['patch']

function toMs(value: string | Date | number | undefined): number | undefined {
  if (value === undefined) return undefined
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? undefined : time
}

/**
 * The sections a panel page loads when it opens: device sessions, passkeys,
 * received gifts, and one email's delivery status. Each composable is created
 * the first time it is asked for (inside the app context `run` provides) and
 * mirrored into the bridge from then on. Only what the panel shows is copied:
 * a passkey's credential stays in the app.
 */
export function createOnDemandSections(run: <T>(fn: () => T) => T, patch: Patch): Omit<DevtoolsBridgeRequests, 'activate'> {
  let sessions: UseSessionsReturn | undefined
  let passkeys: UsePasskeysReturn | undefined
  let gifts: UseGiftsReturn | undefined
  let email: UseEmailStatusReturn | undefined
  const emailId = ref<string>()

  const loaders: Record<DevtoolsOnDemandSection, () => void> = {
    sessions() {
      // A live query: created once, it keeps the panel current on its own.
      if (sessions) return
      const list = useSessions()
      sessions = list
      watchEffect(() => patch('sessions', {
        isLoading: list.isLoading.value,
        ...(list.error.value ? { error: list.error.value.message } : {}),
        items: (list.sessions.value ?? []).map(session => ({
          device: describeUserAgent(session.userAgent) ?? 'Unknown device',
          current: session.current,
          createdAt: toMs(session.createdAt),
        })),
      }))
    },
    passkeys() {
      if (!passkeys) {
        const list = usePasskeys({ immediate: false })
        passkeys = list
        watchEffect(() => patch('passkeys', {
          isLoading: list.isLoading.value,
          ...(list.error.value ? { error: list.error.value } : {}),
          items: (list.passkeys.value ?? []).map(passkey => ({
            name: passkey.name ?? undefined,
            deviceType: passkey.deviceType,
            backedUp: passkey.backedUp,
            createdAt: toMs(passkey.createdAt),
          })),
        }))
      }
      passkeys.refresh().catch(() => {})
    },
    gifts() {
      if (gifts) return
      // Only looks: a gift is claimed by its recipient's own click.
      const received = useGifts()
      gifts = received
      watchEffect(() => {
        const rows = received.received.value
        patch('gifts', {
          isLoading: rows === undefined,
          received: rows?.length ?? 0,
          unclaimed: received.unclaimed.value.length,
          claimed: (rows ?? []).filter(gift => gift.status === 'claimed').length,
        })
      })
    },
  }

  return {
    request(section) {
      run(() => loaders[section]())
    },
    lookupEmail(id) {
      if (!email) {
        run(() => {
          const status = useEmailStatus({ emailId })
          email = status
          watchEffect(() => {
            if (!emailId.value) return
            patch('emailLookup', {
              emailId: emailId.value,
              isLoading: status.isLoading.value,
              status: status.status.value,
              found: status.data.value != null,
              ...(status.error.value ? { error: status.error.value.message } : {}),
            })
          })
        })
      }
      emailId.value = id.trim() || undefined
    },
  }
}
