import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject, ref } from 'vue'
import { ConvexAuthStateKey, useAction, useMutation } from 'nuxt-convex-module/client'
import type {
  AnnouncementRow,
  AnnouncementsConsole,
  LiveAnnouncement,
  PublishAnnouncementInput,
} from '../../../convex/integrations/announcements'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, diagnostics, useLiveQuery } from '../utils/live-query'
import { useApiNamespace, useBackendNamespace } from '../utils/namespace'

export type {
  AnnouncementAudience,
  AnnouncementRow,
  AnnouncementsConsole,
  LiveAnnouncement,
  PublishAnnouncementInput,
} from '../../../convex/integrations/announcements'

/** The announcement functions re-exported from your `backend/email.ts` (`email.api`). */
export interface AnnouncementsApiRefs {
  getAnnouncements?: FunctionReference<'query', 'public', Record<string, never>, LiveAnnouncement[]>
  dismissAnnouncement?: FunctionReference<'mutation', 'public', { id: string }, null>
  getAnnouncementsConsole?: FunctionReference<'query', 'public', Record<string, never>, AnnouncementsConsole | null>
  publishAnnouncement?: FunctionReference<'mutation', 'public', PublishAnnouncementInput, { id: string }>
  endAnnouncement?: FunctionReference<'mutation', 'public', { id: string }, { ended: boolean }>
  previewAnnouncement?: FunctionReference<'mutation', 'public', { id: string }, { emailId: string | null }>
  sendAnnouncement?: FunctionReference<'action', 'public', { id: string, scheduledAt?: number }, { sendAt: number | null }>
  cancelAnnouncement?: FunctionReference<'action', 'public', { id: string }, { cancelled: boolean }>
}

export interface UseAnnouncementsOptions {
  /** Override the injected `api.email` namespace. */
  api?: AnnouncementsApiRefs
}

export interface UseAnnouncementsReturn {
  /** The announcements the person sees now, the newest first, live: `[]` signed out, while they load, and without `backend/email.ts`. */
  announcements: ComputedRef<LiveAnnouncement[]>
  /** `true` while a dismissal is saved. */
  isPending: ComputedRef<boolean>
  /** Why the last dismissal failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Dismiss one announcement: it goes at once, and stays dismissed for the person. Rejects on failure. */
  dismiss: (id: string) => Promise<void>
  /** Where an announcement's link goes: its path on the app, or its `https:` URL; and whether it leaves the app. */
  linkOf: (announcement: LiveAnnouncement) => { href: string, external: boolean } | null
}

/**
 * The announcements an administrator published that the signed-in person
 * has not dismissed, live: what `<BackendNotices>`' `announcement` notice
 * shows. A new one appears without a reload; a dismissed one goes at once
 * and stays gone for the person on every device.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { announcements, dismiss } = useAnnouncements()
 * </script>
 * <template>
 *   <p v-for="item in announcements" :key="item.id">
 *     {{ item.message }} <button @click="dismiss(item.id)">Dismiss</button>
 *   </p>
 * </template>
 * ```
 */
export function useAnnouncements(options: UseAnnouncementsOptions = {}): UseAnnouncementsReturn {
  // The notice renders on every page: an app without announcements reads nothing, and says nothing.
  const api = options.api ?? useApiNamespace<AnnouncementsApiRefs>('email') ?? {}
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const read = api.getAnnouncements
    ? useLiveQuery(api.getAnnouncements, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<LiveAnnouncement[]>()
  const runDismiss = api.dismissAnnouncement ? useMutation(api.dismissAnnouncement) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  // Dismissed in this page: gone before the read catches up.
  const dismissed = ref<string[]>([])

  return {
    announcements: computed(() => {
      if (signedOut.value) return []
      const now = Date.now()
      return (read.data.value ?? []).filter(item => item.expiresAt > now && !dismissed.value.includes(item.id))
    }),
    isPending,
    error: computed(() => failure.value),
    dismiss: id => run(async () => {
      if (!runDismiss) throw new Error('[nuxt-backend] useAnnouncements() needs `dismissAnnouncement` re-exported from setupEmail() in backend/email.ts, or pass { api }.')
      dismissed.value = [...dismissed.value, id]
      try {
        await runDismiss({ id })
      }
      catch (error) {
        dismissed.value = dismissed.value.filter(other => other !== id)
        throw error
      }
    }),
    linkOf: (announcement) => {
      const url = announcement.link?.url
      if (!url) return null
      return { href: url, external: !url.startsWith('/') }
    },
  }
}

export interface UseAnnouncementsAdminOptions {
  /** Override the injected `api.email` namespace. */
  api?: AnnouncementsApiRefs
}

export interface UseAnnouncementsAdminReturn {
  /** The Announcements tab's data, live. `null` for a caller who is no administrator, `undefined` while it is read. */
  console: ComputedRef<AnnouncementsConsole | null | undefined>
  /** The announcements, newest first. */
  announcements: ComputedRef<AnnouncementRow[]>
  isLoading: ComputedRef<boolean>
  /** `true` once the read answered that this caller is no administrator. */
  isRefused: ComputedRef<boolean>
  /** `true` while a change runs. */
  isPending: ComputedRef<boolean>
  /** Why the last change failed, else why the read failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Publish an announcement: its notice shows at once. Takes a recent sign-in. Resolves its id; rejects on failure. */
  publish: (input: PublishAnnouncementInput) => Promise<string>
  /** End a notice before it expires. Takes a recent sign-in. */
  end: (id: string) => Promise<boolean>
  /** Email yourself the broadcast, through the transactional path (test mode outside production). */
  preview: (id: string) => Promise<void>
  /** Send the broadcast now, or at `scheduledAt`. Refused outside production. Takes a recent sign-in. Resolves when it goes out. */
  send: (id: string, scheduledAt?: number) => Promise<number | null>
  /** Cancel a broadcast that has not gone out. Takes a recent sign-in. */
  cancel: (id: string) => Promise<boolean>
}

/**
 * The admin console's Announcements tab, as data: every announcement with
 * its notice and its broadcast, and the changes an administrator makes,
 * through `backend/email.ts`. Every change is an administrator's in person
 * and takes a recent sign-in (`useReauthentication().withReauthentication`
 * asks for one).
 */
export function useAnnouncementsAdmin(options: UseAnnouncementsAdminOptions = {}): UseAnnouncementsAdminReturn {
  const api = useBackendNamespace<AnnouncementsApiRefs>('email', 'useAnnouncementsAdmin', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const read = api.getAnnouncementsConsole ? useLiveQuery(api.getAnnouncementsConsole, () => (signedOut.value ? 'skip' : {})) : absentQuery<AnnouncementsConsole | null>()
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  const missing = (name: string): never => {
    throw new Error(`[nuxt-backend] The Announcements tab needs \`${name}\` re-exported from setupEmail() in backend/email.ts, or pass \`{ api }\` to useAnnouncementsAdmin().`)
  }
  const warn = (ref: unknown, name: string) => {
    if (!ref && diagnostics.enabled) console.warn(`[nuxt-backend] useAnnouncementsAdmin(): the backend exports no \`${name}\`: re-export it from backend/email.ts with the rest of \`email.api\`.`)
  }
  warn(api.publishAnnouncement, 'publishAnnouncement')
  const publish = api.publishAnnouncement ? useMutation(api.publishAnnouncement) : null
  const end = api.endAnnouncement ? useMutation(api.endAnnouncement) : null
  const preview = api.previewAnnouncement ? useMutation(api.previewAnnouncement) : null
  const send = api.sendAnnouncement ? useAction(api.sendAnnouncement) : null
  const cancel = api.cancelAnnouncement ? useAction(api.cancelAnnouncement) : null

  const data = computed(() => {
    if (authLoading.value) return undefined
    if (signedOut.value) return null
    return read.data.value
  })
  return {
    console: data,
    announcements: computed(() => data.value?.announcements ?? []),
    isLoading: computed(() => authLoading.value || (!signedOut.value && read.isLoading.value)),
    isRefused: computed(() => !signedOut.value && read.data.value === null),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : read.error.value)),
    publish: input => run(async () => (publish ?? missing('publishAnnouncement'))(input).then(result => result.id)),
    end: id => run(async () => (end ?? missing('endAnnouncement'))({ id }).then(result => result.ended)),
    preview: id => run(async () => {
      await (preview ?? missing('previewAnnouncement'))({ id })
    }),
    send: (id, scheduledAt) => run(async () => (send ?? missing('sendAnnouncement'))({ id, ...(scheduledAt !== undefined ? { scheduledAt } : {}) }).then(result => result.sendAt)),
    cancel: id => run(async () => (cancel ?? missing('cancelAnnouncement'))({ id }).then(result => result.cancelled)),
  }
}
