import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type Ref } from 'vue'
import { useFetch } from '#imports'
import type { AccountDataRecord } from '../../../../convex/account-data'
import { HEALTH_ROUTE } from '../../../../convex/constants'
import { BROWSER_STORAGE, browserStorageInUse, capabilityInUse, dataMap, type DataMapGroup, LEGAL_PAGE_KEYS, type LegalDetails, type LegalPageKey, SUBPROCESSORS, subprocessorsInUse } from '../../../../convex/legal'
import { useBackendConfig } from '../../composables/use-backend-config'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { type LabelGroupOverrides, useLabels } from '../../composables/use-labels'
import { absentQuery, useLiveQuery } from '../../utils/live-query'
import { useApiNamespace } from '../../utils/namespace'

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
const DETAIL_KEYS = ['company', 'address', 'contact', 'dpo', 'registration', 'vat', 'phone', 'director', 'capital'] as const satisfies ReadonlyArray<keyof LegalDetails>

/** The details a page names as missing in development: the ones every page needs. */
const NEEDED_KEYS = ['company', 'address', 'contact'] as const satisfies ReadonlyArray<keyof LegalDetails>

/** A processor as a page lists it. */
export interface LegalProcessor {
  /** A package processor's key, or `own:<n>` for the app's own row n. */
  key: keyof typeof SUBPROCESSORS | `own:${number}`
  /** Its own name, as its makers write it. */
  name: string
  agreement: string | null
  /** What it processes: the processor's label, or the app's words for a row of its own. */
  processes: string
  /** Where it keeps the data: the processor's label, or the app's words. */
  location: string
}

/** A stored item as a page lists it. */
export interface LegalStoredItem {
  /** A package item's key, or `own:<n>` for the app's own row n. */
  key: keyof typeof BROWSER_STORAGE | `own:${number}`
  name: string
  kind: 'cookie' | 'httpOnly' | 'localStorage' | 'sessionStorage' | 'push'
  consent: 'necessary' | 'preferences' | 'replay' | 'analytics'
  /** What it is for and how long it lasts: the item's labels, or the app's words for a row of its own. */
  why: string
  lasts: string
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
export function useLegalDocument(page: LegalPageKey, health: Ref<Health | null | undefined>, overrides?: () => LabelGroupOverrides<'legal'> | undefined) {
  const config = useBackendConfig()
  const labels = useLabels('legal', overrides)
  const inUse = (capability: AccountDataRecord['capability']) => capabilityInUse(health.value?.capabilities, capability)

  const details = computed<LegalDetails>(() => Object.fromEntries(DETAIL_KEYS.flatMap((key) => {
    const value = config.legal?.[key]?.trim()
    return value ? [[key, value]] : []
  })))
  /** The app as the pages name it: the brand, else "this app". */
  const app = computed(() => config.brand?.name || labels.t('thisApp'))
  /** The `appConfig.backend.legal` keys still unset that this page would show. */
  const missing = computed(() => {
    if (page === 'subprocessors') return []
    const keys: string[] = NEEDED_KEYS.filter(key => !details.value[key])
    // A host that takes reports names its points of contact under the Digital Services Act (Art. 11 and 12), with their languages.
    if (page === 'terms' && paths.report.value) {
      const points = config.legal?.contactPoints
      if (!points?.authorities?.trim()) keys.push('contactPoints.authorities')
      if (!points?.languages?.some(code => code.trim())) keys.push('contactPoints.languages')
    }
    return keys
  })

  const groups: ComputedRef<DataMapGroup[]> = computed(() => dataMap(inUse))
  // An app on another host names it, where it runs the app and its agreement, in place of Vercel's row.
  const host = computed(() => {
    const { name, location, agreement } = config.legal?.host ?? {}
    return name?.trim() && location?.trim() ? { name: name.trim(), location: location.trim(), agreement: agreement?.trim() || null } : null
  })
  /** The host as a legal notice names it: its name, address and phone, once the app gives an address or a phone. */
  const hostLine = computed(() => hostLineOf(config.legal?.host))
  const processors = computed<LegalProcessor[]>(() => [
    ...subprocessorsInUse(inUse).map((key): LegalProcessor => {
      const processes = labels.t(`processors.${key}.processes`)
      if (key === 'host' && host.value) return { key, ...host.value, processes }
      const processor: { name: string, agreement?: string } = SUBPROCESSORS[key]
      return { key, name: processor.name, agreement: processor.agreement ?? null, processes, location: config.legal?.locations?.[key]?.trim() || labels.t(`processors.${key}.location`) }
    }),
    ...(config.legal?.processors ?? []).filter(row => row.name?.trim()).map((row, index): LegalProcessor => ({ key: `own:${index}`, name: row.name, agreement: row.agreement?.trim() || null, processes: row.processes, location: row.location })),
  ])
  const storage = computed<LegalStoredItem[]>(() => [
    ...browserStorageInUse(inUse).map((key): LegalStoredItem => {
      const item = BROWSER_STORAGE[key]
      return { key, name: item.name, kind: item.kind === 'cookie' && item.httpOnly ? 'httpOnly' : item.kind, consent: item.consent, why: labels.t(`storage.${key}.why`), lasts: labels.t(`storage.${key}.lasts`) }
    }),
    ...(config.legal?.storage ?? []).filter(row => row.name?.trim()).map((row, index): LegalStoredItem => ({ key: `own:${index}`, name: row.name, kind: row.kind, consent: row.consent ?? 'necessary', why: row.why, lasts: row.lasts })),
  ])
  /** The users' point of contact is `legal.contact` itself: the terms page names it once, in a sentence. */
  const usersIsContact = computed(() => {
    const users = config.legal?.contactPoints?.users?.trim()
    return !users || users === config.legal?.contact?.trim()
  })
  /** The consumer mediator, while the app names one. */
  const mediator = computed(() => {
    const name = config.legal?.mediator?.name?.trim()
    return name ? { name, url: config.legal?.mediator?.url?.trim() || null } : null
  })
  const billing = computed(() => inUse('billing'))
  const versions = useConsentVersions()
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
    mediator,
    usersIsContact,
    hostLine,
    /** The version of this page's document, as `setupAccount({ consents })` declares it; null without one. */
    version: computed(() => (page === 'privacy' || page === 'terms' ? versions.version(page) : null)),
    /** The merchant of record's name and its terms for buyers, while billing is in use. */
    merchant: computed(() => (billing.value ? { name: SUBPROCESSORS.billing.name, terms: SUBPROCESSORS.billing.agreement } : null)),
    paths,
    links,
  }
}

/** What {@link useLegalDocument} returns. */
export type LegalDocument = ReturnType<typeof useLegalDocument>

/** What `getConsentTerms` says of the documents an app declares. */
interface ConsentDocuments {
  documents?: Array<{ kind: string, version: string }>
}

/** The function of `account.api` the versions come from. */
interface ConsentDocumentsApi {
  getConsentTerms?: FunctionReference<'query', 'public', Record<string, never>, ConsentDocuments>
}

/**
 * The versions of the documents `setupAccount({ consents })` declares, by
 * kind, live from `getConsentTerms`: the version the consent ledger records
 * when someone agrees, so a page prints the same one. `null` for a kind
 * the app does not declare, and until the deployment answers.
 *
 * @internal
 */
export function useConsentVersions() {
  const api = useApiNamespace<ConsentDocumentsApi>('account')
  const read = api?.getConsentTerms ? useLiveQuery(api.getConsentTerms, () => ({})) : absentQuery<ConsentDocuments>()
  return {
    version: (kind: string): string | null => read.data.value?.documents?.find(document => document.kind === kind)?.version ?? null,
    isLoading: read.isLoading,
  }
}

/**
 * A legal table's state when it stands alone, in a page of the app's or a
 * Content page: the health read starts here, and shares its key with the
 * packaged pages', so a table inside one reads what the page already has.
 * Not awaited: a server render waits for it, and a navigation lists every
 * capability until it lands.
 *
 * @internal
 */
export function useLegalTable(labels: () => LabelGroupOverrides<'legal'> | undefined): LegalDocument {
  const { data } = useLegalHealth()
  return useLegalDocument('privacy', data, labels)
}

/** A detail `<LegalDetail>` prints. */
export type LegalDetailField = 'company' | 'address' | 'contact' | 'dpo' | 'registration' | 'vat' | 'phone' | 'director' | 'capital' | 'mediator' | 'host'

/** The host's name, address and phone in one line, once the app gives an address or a phone; `null` otherwise. */
export function hostLineOf(host: { name?: string, address?: string, phone?: string } | undefined): string | null {
  const parts = [host?.name, host?.address, host?.phone].map(part => part?.trim()).filter((part): part is string => Boolean(part))
  return host?.address?.trim() || host?.phone?.trim() ? parts.join(', ') : null
}

/** A contact as a link: an address as `mailto:`, a URL as itself, anything else none. */
function contactHref(contact: string): string | null {
  if (!/[\s/:]/.test(contact) && contact.indexOf('@') > 0 && contact.lastIndexOf('.') > contact.indexOf('@')) return `mailto:${contact}`
  return /^https?:\/\//i.test(contact) ? contact : null
}

/** What `<LegalDetail>` shows: the text, the link it is, and in development the note for an unset field. */
export interface LegalDetailView {
  text: string | null
  href: string | null
  /** The link leaves the site: it opens in a new tab. */
  external: boolean
  unsetNote: string | null
}

/**
 * One company detail from `appConfig.backend.legal`, as `<LegalDetail>`
 * prints it: the contact and the data protection officer as links when
 * they are an address or a URL, the mediator as its name, linking its site.
 *
 * @internal
 */
export function useLegalDetail(field: () => LegalDetailField, overrides: () => LabelGroupOverrides<'legal'> | undefined): ComputedRef<LegalDetailView> {
  const config = useBackendConfig()
  const { t } = useLabels('legal', overrides)
  return computed(() => {
    const legal = config.legal ?? {}
    const key = field()
    const unset: LegalDetailView = { text: null, href: null, external: false, unsetNote: import.meta.dev ? t('unset', { fields: key }) : null }
    if (key === 'host') {
      const text = hostLineOf(legal.host)
      return text ? { text, href: null, external: false, unsetNote: null } : unset
    }
    if (key === 'mediator') {
      const name = legal.mediator?.name?.trim()
      const url = legal.mediator?.url?.trim() || null
      return name ? { text: name, href: url, external: Boolean(url), unsetNote: null } : unset
    }
    const text = legal[key]?.trim()
    if (!text) return unset
    const href = key === 'contact' || key === 'dpo' ? contactHref(text) : key === 'phone' ? `tel:${text.replace(/[^+\d]/g, '')}` : null
    return { text, href, external: Boolean(href?.startsWith('http')), unsetNote: null }
  })
}

/**
 * The version of one consent kind, as `<LegalVersion>` prints it, with the
 * development note for a kind the app does not declare.
 *
 * @internal
 */
export function useLegalVersion(kind: () => string, overrides: () => LabelGroupOverrides<'legal'> | undefined): ComputedRef<{ text: string | null, unsetNote: string | null }> {
  const versions = useConsentVersions()
  const { t } = useLabels('legal', overrides)
  return computed(() => {
    const text = versions.version(kind())
    return { text, unsetNote: !text && import.meta.dev && !versions.isLoading.value ? t('versionUnset', { kind: kind() }) : null }
  })
}

/** One point of contact as `<LegalContactPoints>` lists it. */
export interface LegalContactPoint {
  /** Who it is for. */
  key: 'authorities' | 'users'
  contact: string
  /** The contact as a link: `mailto:` for an address, the URL itself, or none. */
  href: string | null
}

/**
 * The single points of contact the Digital Services Act asks every host to
 * name (Art. 11 for authorities, Art. 12 for the people who use the app),
 * from `appConfig.backend.legal.contactPoints`, the users' falling back to
 * `legal.contact`, with the languages answered in by name in the reader's
 * language.
 *
 * @internal
 */
export function useContactPoints(overrides: () => LabelGroupOverrides<'legal'> | undefined, except: () => ReadonlyArray<LegalContactPoint['key']> = () => []) {
  const config = useBackendConfig()
  const labels = useLabels('legal', overrides)
  const points = computed<LegalContactPoint[]>(() => {
    const declared = config.legal?.contactPoints
    const found: Array<[LegalContactPoint['key'], string | undefined]> = [['authorities', declared?.authorities], ['users', declared?.users ?? config.legal?.contact]]
    return found.flatMap(([key, value]) => {
      const contact = value?.trim()
      return contact && !except().includes(key) ? [{ key, contact, href: contactHref(contact) }] : []
    })
  })
  const languages = computed(() => (config.legal?.contactPoints?.languages ?? []).flatMap((code) => {
    const tag = code.trim()
    if (!tag) return []
    try {
      return [new Intl.DisplayNames(labels.locale.value ? [labels.locale.value] : undefined, { type: 'language' }).of(tag) ?? tag]
    }
    catch {
      return [tag]
    }
  }))
  const app = computed(() => config.brand?.name || labels.t('thisApp'))
  return { ...labels, points, languages, app }
}

/**
 * The automated tools that check content, from
 * `appConfig.backend.legal.moderation`, each with whether its verdict takes
 * effect on its own or waits for a person (DSA Art. 14).
 *
 * @internal
 */
export function useModerationTools(overrides: () => LabelGroupOverrides<'legal'> | undefined) {
  const config = useBackendConfig()
  const labels = useLabels('legal', overrides)
  const tools = computed(() => (config.legal?.moderation ?? []).filter(tool => tool.name?.trim() && tool.checks?.trim()).map((tool, index) => ({ key: `tool:${index}`, name: tool.name.trim(), checks: tool.checks.trim(), decides: tool.decides === true })))
  return { ...labels, tools }
}
