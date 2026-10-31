import type { FunctionReference } from 'convex/server'
import { computed, inject, watch, type ComputedRef } from 'vue'
import { tryUseNuxtApp } from '#imports'
import { useBetterAuth } from 'nuxt-convex-module/better-auth/client'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import { AGE_KIND, encodeStorage, STORAGE_PURPOSES, type StorageChoice, type StoragePurpose } from '../../../convex/consent-rules.js'
import type { ConsentsView, ConsentTerms } from '../../../convex/integrations/account'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useApiNamespace } from '../utils/namespace'
import { useLastSignInState } from '../utils/last-sign-in'
import { allowedBy, useStorageChoice, writeStorageChoice } from '../utils/storage-choice'
import { useBackendConfig } from './use-backend-config'
import { useLabels } from './use-labels'

export type { ConsentsView, ConsentTerms } from '../../../convex/integrations/account'
export type { StorageChoice } from '../../../convex/consent-rules'

/** The consent functions re-exported from your `backend/account.ts`. */
export interface ConsentsApi {
  getConsents?: FunctionReference<'query', 'public', Record<string, never>, ConsentsView | null>
  getConsentTerms?: FunctionReference<'query', 'public', Record<string, never>, ConsentTerms>
  grantConsent?: FunctionReference<'mutation', 'public', { kind: string, age?: number, source?: 'prompt' | 'settings' }, null>
  withdrawConsent?: FunctionReference<'mutation', 'public', { kind: string }, null>
  chooseStorage?: FunctionReference<'mutation', 'public', { purposes: string[], source?: 'prompt' | 'settings' }, null>
}

export interface UseConsentsOptions {
  /** Override the injected `api.account` namespace. */
  api?: ConsentsApi
}

/** One consent the person gave, as `consents` holds it. */
export interface ConsentState {
  /** The version they agreed to. */
  version: string
  /** When they agreed (epoch ms). */
  grantedAt: number
  /** `true` when that is the latest version the app declares. */
  current: boolean
}

/** One required consent of the app, as a sign-in form names it. */
export interface ConsentTerm {
  kind: string
  version: string
  /** The words that name it: the declaration's `title`, else the `consent.kinds.<kind>` label, else the kind. */
  title: string
  url?: string
}

/** One kind the person is asked about, as `<ConsentPrompt>` lists it. */
export interface ConsentAsk extends ConsentTerm {
  required: boolean
  /** `true` when they agreed to an earlier version: the document changed. */
  changed: boolean
}

export interface UseConsentsReturn {
  /**
   * What the signed-in person agreed to, by kind: its `version`, when
   * (`grantedAt`) and whether that is the latest version (`current`). A kind
   * they never agreed to, or withdrew, is absent. Empty when signed out and
   * while it is read.
   */
  consents: ComputedRef<Record<string, ConsentState | undefined>>
  /**
   * The required kinds not yet accepted at their latest version, with `age`
   * while the app's minimum age is unanswered. What `<ConsentPrompt>` asks.
   */
  missing: ComputedRef<string[]>
  /** The required kinds the app declares, for the agreement line of a sign-in form of your own. */
  terms: ComputedRef<ConsentTerm[]>
  /** The minimum age the app sets, else `null`. */
  minimumAge: ComputedRef<number | null>
  /**
   * The kinds the person is asked about now: `missing`, with their names,
   * versions and links, or the ones `kinds` names.
   */
  asks: (kinds?: readonly string[]) => ConsentAsk[]
  /**
   * Agree to a kind of the app's at its latest version. For `age`, pass the
   * `age` typed: it is checked against the minimum and never kept. Rejects on
   * failure (`invalid_input` on `kind`; `forbidden`, reason `under_age`;
   * `forbidden`, reason `impersonating` for an administrator acting as the
   * account).
   */
  grant: (kind: string, options?: { age?: number }) => Promise<void>
  /** Withdraw an opt-in. A required kind can't be withdrawn (`invalid_input` on `kind`, reason `required`). Rejects on failure. */
  withdraw: (kind: string) => Promise<void>
  /** `true` while a grant, a withdrawal or a choice of storage runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, else why the consents could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
  /**
   * The optional storage this browser asks about, by purpose: `true` once
   * allowed, `false` until then. Empty while the app uses only strictly
   * necessary storage (`appConfig.backend.consent.purposes` is empty), when
   * the consent manager is off and nothing renders. A signed-in person's
   * choice follows them from the ledger to another browser.
   */
  storage: ComputedRef<StorageChoice>
  /**
   * Choose purposes of optional storage: the ones named are set, the rest
   * keep their value, so `allowStorage({ analytics: true })` leaves the others
   * as they are. Keeps the choice in a first-party cookie and, signed in, on
   * the ledger. A purpose that turns off deletes what it stored. Resolves
   * once saved; a failure to reach the ledger rejects, and the cookie stands.
   */
  allowStorage: (choice: StorageChoice) => Promise<void>
  /**
   * `true` while the consent manager is on and this browser has not chosen
   * yet. Never while an administrator visits an account: the choice is the
   * account's own, and they cannot make it.
   */
  isAsking: ComputedRef<boolean>
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /**
     * The browser's choice of optional storage was set or read back: start an
     * integration that needs a purpose when it is `true`, and stop it when
     * it turns `false`. Runs on the client only.
     */
    'backend:storage': (choice: StorageChoice) => void | Promise<void>
  }
}

/** A kind's name when nothing else names it: `gallery-rules` reads "gallery rules". */
function plain(kind: string): string {
  return kind.replace(/[-_]+/g, ' ')
}

/**
 * What a signed-in person agreed to, and the consent manager for optional
 * storage. Declare the kinds in `setupAccount({ consents })`; read them
 * here for a settings page of your own, grant and withdraw opt-ins, and
 * read or change which optional storage this browser allows.
 * `<ConsentPrompt>` is built on it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { consents, grant, withdraw, isPending } = useConsents()
 * </script>
 * <template>
 *   <label>
 *     <input type="checkbox" :checked="consents.gallery?.current" :aria-disabled="isPending || undefined"
 *       @change="consents.gallery?.current ? withdraw('gallery') : grant('gallery')">
 *     Show my strips in the public gallery
 *   </label>
 * </template>
 * ```
 */
export function useConsents(options: UseConsentsOptions = {}): UseConsentsReturn {
  // Quiet when the app has none: the consent manager rides on every page, and an app that never declared a consent has nothing to warn about.
  const api = options.api ?? useApiNamespace<ConsentsApi>('account') ?? {}
  const config = useBackendConfig()
  const { t } = useLabels('consent')
  const nuxtApp = tryUseNuxtApp()
  const state = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => state == null || !state.isAuthenticated.value)
  const { session } = useBetterAuth()
  const visiting = computed(() => Boolean((session?.value?.data?.session as { impersonatedBy?: unknown } | undefined)?.impersonatedBy))

  const read = api.getConsents
    ? useLiveQuery(api.getConsents, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<ConsentsView | null>()
  const termsRead = api.getConsentTerms ? useLiveQuery(api.getConsentTerms, () => ({})) : absentQuery<ConsentTerms>()
  const grantCall = api.grantConsent ? useMutation(api.grantConsent) : null
  const withdrawCall = api.withdrawConsent ? useMutation(api.withdrawConsent) : null
  const chooseCall = api.chooseStorage ? useMutation(api.chooseStorage) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  const view = computed(() => (signedOut.value ? null : read.data.value ?? null))

  const titleOf = (kind: string, title?: string): string => {
    if (title) return title
    // The two the package knows are labels, which an app overrides or translates; any other kind is named by its declaration.
    if (kind === 'terms' || kind === 'privacy') return t(`kinds.${kind}`)
    return plain(kind).replace(/^./, first => first.toUpperCase())
  }

  const terms = computed<ConsentTerm[]>(() => (termsRead.data.value?.terms ?? []).map(({ kind, version, url, title }) => ({
    kind,
    version,
    title: titleOf(kind, title),
    ...(url ? { url } : {}),
  })))

  const asks = (kinds?: readonly string[]): ConsentAsk[] => {
    const current = view.value
    if (!current) return []
    const wanted = kinds ?? current.missing.filter(kind => kind !== AGE_KIND)
    return current.consents
      .filter(consent => wanted.includes(consent.kind) && !consent.current)
      .map(consent => ({
        kind: consent.kind,
        version: consent.version,
        title: titleOf(consent.kind, consent.title),
        ...(consent.url ? { url: consent.url } : {}),
        required: consent.required,
        changed: consent.grantedVersion !== null,
      }))
  }

  // ── Optional storage ──────────────────────────────────────────────────

  /** The purposes this browser asks about: the app's, with `preferences` whenever another is. */
  const asked = computed<StoragePurpose[]>(() => {
    const declared = (config.consent?.purposes ?? []).filter((purpose): purpose is StoragePurpose => (STORAGE_PURPOSES as readonly string[]).includes(purpose))
    const withPreferences = declared.length > 0 && !declared.includes('preferences') ? [...declared, 'preferences' as const] : declared
    return STORAGE_PURPOSES.filter(purpose => withPreferences.includes(purpose))
  })

  const cookie = useStorageChoice()
  const lastSignIn = useLastSignInState()
  /** What this browser allows: the cookie, else (signed in) the ledger's choice from another browser. */
  const allowed = computed<StoragePurpose[] | null>(() => allowedBy(cookie.value) ?? (view.value?.storage as StoragePurpose[] | null | undefined) ?? null)

  const storage = computed<StorageChoice>(() => Object.fromEntries(asked.value.map(purpose => [purpose, allowed.value?.includes(purpose) ?? false])))
  const isAsking = computed(() => asked.value.length > 0 && allowed.value === null && !visiting.value)

  // The value `allowStorage` wrote itself, which it saves to the ledger on its own.
  let own: string | undefined
  // A choice made in another browser reaches this one, and a choice made
  // signed out reaches the ledger once the person signs in.
  watch([view, cookie], ([current, value]) => {
    if (!current || asked.value.length === 0 || value === own) return
    const fromLedger = current.storage as StoragePurpose[] | null
    if (allowedBy(value) === null && fromLedger !== null) writeStorageChoice(cookie, encodeStorage(fromLedger), fromLedger, lastSignIn)
    else if (allowedBy(value) !== null && fromLedger === null && chooseCall) void chooseCall({ purposes: allowedBy(value)!, source: 'prompt' }).catch(() => {})
  }, { immediate: true })

  // Integrations hear the choice: the client only.
  if (import.meta.client && nuxtApp) {
    watch(storage, (choice) => {
      if (allowed.value !== null) void nuxtApp.callHook('backend:storage', choice)
    }, { immediate: true })
  }

  const allowStorage = (choice: StorageChoice): Promise<void> => {
    const source = isAsking.value ? 'prompt' : 'settings'
    const next = STORAGE_PURPOSES.filter(purpose => asked.value.includes(purpose) && (purpose in choice ? choice[purpose] === true : storage.value[purpose] === true))
    own = encodeStorage(next)
    writeStorageChoice(cookie, own, next, lastSignIn)
    if (signedOut.value || !chooseCall) return Promise.resolve()
    return run(async () => {
      await chooseCall({ purposes: next, source })
    })
  }

  return {
    consents: computed(() => Object.fromEntries((view.value?.consents ?? [])
      .filter(consent => consent.grantedVersion !== null)
      .map(consent => [consent.kind, { version: consent.grantedVersion!, grantedAt: consent.grantedAt!, current: consent.current }]))),
    missing: computed(() => view.value?.missing ?? []),
    terms,
    minimumAge: computed(() => termsRead.data.value?.minimumAge ?? view.value?.minimumAge ?? null),
    asks,
    grant: (kind, grantOptions = {}) => run(async () => {
      if (!grantCall) throw new Error('[nuxt-backend] Granting a consent needs `grantConsent` re-exported from setupAccount() in backend/account.ts, or pass `{ api }` to useConsents().')
      await grantCall({ kind, ...(grantOptions.age !== undefined ? { age: grantOptions.age } : {}), source: kind === AGE_KIND ? 'prompt' : 'settings' })
    }),
    withdraw: kind => run(async () => {
      if (!withdrawCall) throw new Error('[nuxt-backend] Withdrawing a consent needs `withdrawConsent` re-exported from setupAccount() in backend/account.ts, or pass `{ api }` to useConsents().')
      await withdrawCall({ kind })
    }),
    isPending,
    error: computed(() => (signedOut.value ? null : failure.value ?? read.error.value)),
    storage,
    allowStorage,
    isAsking,
  }
}
