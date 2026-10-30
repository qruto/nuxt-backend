import { computed, type ComputedRef, type Ref } from 'vue'
import { useFetch } from '#imports'
import type { AccountDataRecord } from '../../../../convex/account-data'
import { HEALTH_ROUTE } from '../../../../convex/constants'
import { BROWSER_STORAGE, browserStorageInUse, capabilityInUse, dataMap, type DataMapGroup, LEGAL_PAGE_KEYS, type LegalDetails, type LegalPageKey, SUBPROCESSORS, subprocessorsInUse } from '../../../../convex/legal'
import { useBackendConfig } from '../../composables/use-backend-config'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useLabels } from '../../composables/use-labels'

// The legal pages, headless: the company details from
// `appConfig.backend.legal`, the app's name, the capabilities it uses (from
// its own health route, `/api/backend/health`, which states each capability
// and nothing about how it is configured), and from them the data map, the
// processors and the stored items to list, with the links between pages.
// `LegalDocument.vue` renders it.

/** The health route's answer, as far as the pages read it. */
interface Health {
  capabilities?: Record<string, string>
}

/** The details a page shows, in the order it shows them. */
const DETAIL_KEYS = ['company', 'address', 'contact', 'dpo'] as const satisfies ReadonlyArray<keyof LegalDetails>

/** A processor as a page lists it. */
export interface LegalProcessor {
  key: keyof typeof SUBPROCESSORS
  /** Its own name, as its makers write it. */
  name: string
  agreement: string | null
  /** Where it keeps the data, as the app wrote it for its own host; null to read the processor's label. */
  location: string | null
}

/** A stored item as a page lists it. */
export interface LegalStoredItem {
  key: keyof typeof BROWSER_STORAGE
  name: string
  kind: 'cookie' | 'httpOnly' | 'localStorage' | 'sessionStorage' | 'push'
  consent: 'necessary' | 'preferences' | 'replay' | 'analytics'
}

/** A link to another legal page. */
export interface LegalLink {
  key: LegalPageKey
  to: string
}

/**
 * The capabilities the app uses, as its health route states them: awaited
 * in the page's setup, so the server render and a client navigation both
 * show the page once it is known.
 *
 * @internal
 */
export function useLegalHealth() {
  // Only the capabilities reach the payload: an administrator's render also gets `detail`, and a
  // cached public page must not carry it.
  return useFetch<Health | null>(HEALTH_ROUTE, { key: 'backend-legal-health', pick: ['capabilities'], default: () => null })
}

/**
 * Everything a legal page fills itself from, given the health
 * {@link useLegalHealth} read. When it cannot reach the backend, every
 * capability counts as in use, so a page lists too much rather than leave
 * a processor out.
 *
 * @internal
 */
export function useLegalDocument(page: LegalPageKey, health: Ref<Health | null | undefined>) {
  const config = useBackendConfig()
  const labels = useLabels('legal')
  const inUse = (capability: AccountDataRecord['capability']) => capabilityInUse(health.value?.capabilities, capability)

  const details = computed<LegalDetails>(() => Object.fromEntries(DETAIL_KEYS.flatMap((key) => {
    const value = config.legal?.[key]?.trim()
    return value ? [[key, value]] : []
  })))
  /** The app as the pages name it: the brand, else "this app". */
  const app = computed(() => config.brand?.name || labels.t('thisApp'))
  /** The `appConfig.backend.legal` keys still unset that this page would show. */
  const missing = computed(() => (page === 'subprocessors' ? [] : DETAIL_KEYS.filter(key => key !== 'dpo' && !details.value[key])))

  const groups: ComputedRef<DataMapGroup[]> = computed(() => dataMap(inUse))
  // An app on another host names it, where it runs the app and its agreement, in place of Vercel's row.
  const host = computed(() => {
    const { name, location, agreement } = config.legal?.host ?? {}
    return name?.trim() && location?.trim() ? { name: name.trim(), location: location.trim(), agreement: agreement?.trim() || null } : null
  })
  const processors = computed<LegalProcessor[]>(() => subprocessorsInUse(inUse).map((key) => {
    if (key === 'host' && host.value) return { key, ...host.value }
    const processor: { name: string, agreement?: string } = SUBPROCESSORS[key]
    return { key, name: processor.name, agreement: processor.agreement ?? null, location: null }
  }))
  const storage = computed<LegalStoredItem[]>(() => browserStorageInUse(inUse).map((key) => {
    const item = BROWSER_STORAGE[key]
    return { key, name: item.name, kind: item.kind === 'cookie' && item.httpOnly ? 'httpOnly' : item.kind, consent: item.consent }
  }))
  const billing = computed(() => inUse('billing'))
  const ai = computed(() => inUse('ai'))

  const paths = {
    privacy: useBackendPagePath('privacy'),
    terms: useBackendPagePath('terms'),
    subprocessors: useBackendPagePath('subprocessors'),
    accessibility: useBackendPagePath('accessibility'),
    security: useBackendPagePath('security'),
    profile: useBackendPagePath('profile'),
    report: useBackendPagePath('report'),
  }
  /** The other legal pages the app serves, for the links under each. */
  const links = computed<LegalLink[]>(() => LEGAL_PAGE_KEYS.filter(key => key !== page).flatMap((key) => {
    const to = paths[key].value
    return to ? [{ key, to }] : []
  }))

  return {
    ...labels,
    page,
    details,
    app,
    missing,
    /** Show the development note naming the unset keys. */
    showMissing: computed(() => import.meta.dev && missing.value.length > 0),
    groups,
    processors,
    storage,
    billing,
    ai,
    /** The merchant of record's name and its terms for buyers, while billing is in use. */
    merchant: computed(() => (billing.value ? { name: SUBPROCESSORS.billing.name, terms: SUBPROCESSORS.billing.agreement } : null)),
    paths,
    links,
  }
}

/** What {@link useLegalDocument} returns. */
export type LegalDocument = ReturnType<typeof useLegalDocument>
