import type { StoragePurpose } from '../convex/consent-rules.js'
import type { SubprocessorKey } from '../convex/legal.js'
import type { BackendLabels, LabelOverrides } from '../convex/labels.js'

/**
 * The `appConfig.backend` content layer — everything a designer edits without
 * touching wiring. Module options own wiring (paths, page set, css,
 * scaffold); app.config owns content (catalog, copy, brand). Components
 * resolve `props ?? appConfig.backend.* ?? built-in default`; labels add an
 * `@nuxtjs/i18n` message between the last two (see `useLabels`).
 */

/**
 * How a plan card reads on the pricing page: presentation only. `key` is
 * the plan's catalog key; its name, prices, trial and credits always come
 * live from billing (`getPricing`), so the page cannot drift from what
 * checkout charges.
 */
export interface PricingPlan {
  key: string
  /** One-line marketing blurb. */
  blurb?: string
  /** What the plan unlocks, in your words (display only; grants come from billing). Default: its feature benefits' names. */
  features?: string[]
  /** Visually emphasize this plan. */
  highlight?: boolean
}

/** How a credit pack reads on the pricing page; `key` is its catalog key. Its price and credits come live from billing. */
export interface CreditPack {
  key: string
  blurb?: string
}

/**
 * A card beside the plans for what you sell in person — an enterprise
 * tier, a custom quote — with a link instead of a checkout.
 */
export interface PricingContact {
  /** The card's heading: `'Enterprise'`. */
  name: string
  blurb?: string
  features?: string[]
  /** Where the button goes: a page of yours, or a `mailto:` address. */
  href: string
  /** The button's words. Default: the `pricing.contact` label. */
  label?: string
}

/** The host an app on another provider than Vercel names on its legal pages (`appConfig.backend.legal.host`). */
export interface LegalHost {
  /** Its name, as its makers write it. */
  name: string
  /** Where it runs the app, in a sentence a privacy notice can carry. */
  location: string
  /** Its data processing agreement. */
  agreement?: string
}

/** The consumer mediator a company joined, which a consumer may turn to for free once they wrote to it (`appConfig.backend.legal.mediator`). */
export interface LegalMediator {
  /** Its name, as it writes it. */
  name: string
  /** Its site, where a consumer files a dispute. */
  url?: string
}

/** A processor of the app's own, listed after the package's (`appConfig.backend.legal.processors`), in the words of the app's language. */
export interface LegalProcessorRow {
  /** Who it is, as its makers write it. */
  name: string
  /** What it processes, in a sentence a privacy notice can carry. */
  processes: string
  /** Where it keeps the data. */
  location: string
  /** Its data processing agreement, or the terms that stand for one. */
  agreement?: string
}

/** A cookie or storage key of the app's own, listed after the package's (`appConfig.backend.legal.storage`), in the words of the app's language. */
export interface LegalStorageRow {
  /** Its name, as the browser shows it. */
  name: string
  /** Where it lives. A cookie the page's scripts cannot read is `httpOnly`. */
  kind: 'cookie' | 'httpOnly' | 'localStorage' | 'sessionStorage' | 'push'
  /** What it is for. */
  why: string
  /** How long it lasts. */
  lasts: string
  /** `necessary` (the default), or the purpose of optional storage it waits for. */
  consent?: 'necessary' | StoragePurpose
}

/** The single points of contact the EU Digital Services Act asks every host to name (`appConfig.backend.legal.contactPoints`, Art. 11 and 12). */
export interface LegalContactPoints {
  /** Where the authorities of the member states, the Commission and the Board reach you (Art. 11): an email address or a URL. */
  authorities?: string
  /** Where the people who use the app reach you (Art. 12): an email address or a URL. Default: `legal.contact`. */
  users?: string
  /** The languages you answer in, as language codes: `['en', 'fr']`. */
  languages?: string[]
}

/** One automated tool that checks content (`appConfig.backend.legal.moderation`, DSA Art. 14), in the words of the app's language. */
export interface LegalModerationTool {
  /** Who makes it, as its makers write it. */
  name: string
  /** What it checks, in a sentence the terms can carry. */
  checks: string
  /** `true`: its verdict takes effect on its own, such as a refused upload, which a person reviews on appeal. Default `false`: it flags content for a person to decide. */
  decides?: boolean
}

export interface BackendAppConfig {
  billing: {
    /**
     * The plan cards `<PricingTable>` shows, in order, with their copy.
     * Empty: every plan on sale, in catalog order.
     */
    plans: PricingPlan[]
    /**
     * The credit packs `<PricingTable>` and `<WorkspaceSettings>` offer, in
     * order. Empty: every pack on sale, in catalog order.
     */
    packs: CreditPack[]
    /** A contact card after the plans (an enterprise tier); none by default. */
    contact?: PricingContact
    /**
     * Credit balance under which the low-credits notice of `<BackendNotices>` appears. One number for
     * the whole app so the nudge is consistent wherever the banner sits; the
     * component's `threshold` prop overrides it per placement.
     */
    lowCreditsThreshold: number
  }
  /** The consent manager for optional storage ([Record consents](/docs/build/auth/accounts/consents#ask-before-optional-storage)). */
  consent: {
    /**
     * The purposes of optional storage the app uses, which `<ConsentPrompt>`
     * asks about once per browser, each off until allowed: `preferences` (the
     * last-sign-in-method cookie behind **Last used**, and a dismissed upgrade
     * prompt kept past the tab), `replay` (session
     * replay in error monitoring, which listing it turns on) and `analytics` (an analytics tool of yours
     * that stores an identifier). Empty (the default): the app uses only
     * strictly necessary storage, the manager stays off and nothing renders.
     * `preferences` is asked whenever another purpose is.
     */
    purposes: StoragePurpose[]
  }
  /** The error-reporting service's browser features ([Monitor errors and uptime](/docs/ship/operate/monitoring)). */
  monitoring: {
    /**
     * Show the service's user feedback widget: a button that sends a report
     * to the monitoring service, in the words of the `feedback` labels,
     * asking for no name, address or screenshot. Needs the SDK and a DSN.
     * Default `false`.
     */
    feedback: boolean
  }
  /**
   * The company details the packaged legal pages are filled from
   * ([Privacy, GDPR and cookies](/docs/ship/compliance/privacy#legal-pages)).
   * A page leaves out what is unset, and says in development which keys are
   * missing.
   */
  legal: {
    /** Your legal entity's name: the controller of your users' data (GDPR Art. 13(1)(a)). */
    company?: string
    /** Its postal address. */
    address?: string
    /** Where people send privacy requests and report an accessibility barrier: an email address or a URL. */
    contact?: string
    /** Your data protection officer's contact, when you must appoint one (GDPR Art. 37); leave it out otherwise. */
    dpo?: string
    /**
     * The host the app runs on, when it is not Vercel: its name, where it
     * runs the app, and its data processing agreement. The pages list it
     * in place of Vercel's row.
     */
    host?: LegalHost
    /** Your company's registration number, as its register writes it: a SIREN, a company number. */
    registration?: string
    /** Your VAT number, or the line that says why you charge none. */
    vat?: string
    /** The consumer mediator you joined, `{ name, url }`: the terms page names it under Disputes. */
    mediator?: LegalMediator
    /**
     * Where a processor of the package's keeps the data, as you state it, by
     * its key: `{ deployment: 'The EU (Dublin)' }`. The pages print yours in
     * place of the processor's general sentence.
     */
    locations?: Partial<Record<SubprocessorKey, string>>
    /** Processors of your own, after the package's: a model provider, an analytics tool. */
    processors?: LegalProcessorRow[]
    /** Cookies and storage keys of your own, after the package's. */
    storage?: LegalStorageRow[]
    /** Your single points of contact under the Digital Services Act, for authorities and for the people who use the app, with the languages you answer in. */
    contactPoints?: LegalContactPoints
    /** The automated tools that check content, which the terms name with how each decides (DSA Art. 14). */
    moderation?: LegalModerationTool[]
  }
  brand: {
    /** Product name used in shipped page copy. */
    name?: string
    /** Logo URL for shipped pages that show one. */
    logo?: string
    /**
     * The sender's postal address, in the footer of every email under a
     * topic and every announcement. The module carries the brand to the
     * backend (`brand.generated.ts`), so the emails read it too.
     */
    address?: string
  }
  /**
   * Copy overrides, by label group and key: `labels.auth.title`. A
   * component's `labels` prop wins over them, and they win over an
   * `@nuxtjs/i18n` message and the English default. Every group and key is in
   * {@link BackendLabels}; the `email` group is not here, because emails
   * render on the backend, which never reads app config. The `notifications`
   * group also takes the words of an app's own kinds, by their type without
   * `app.`: `notifications.<kind>.title` and `.body`.
   */
  labels: LabelOverrides<Omit<BackendLabels, 'email' | 'notifications'>> & {
    notifications?: LabelOverrides<BackendLabels['notifications']> & { [kind: string]: unknown }
  }
}

/**
 * The package defaults. Copy stays out of `labels` on purpose: the English
 * defaults live in one runtime-neutral module the emails read too, and
 * `useLabels` falls back to them key by key, which keeps a partial override
 * partial.
 */
export const backendAppConfigDefaults: BackendAppConfig = {
  billing: { plans: [], packs: [], lowCreditsThreshold: 10 },
  consent: { purposes: [] },
  monitoring: { feedback: false },
  legal: {},
  brand: {},
  labels: {},
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K] }

/** `appConfig.backend` as users may write it (everything optional). */
export type BackendAppConfigInput = DeepPartial<BackendAppConfig>

/** The sections of `appConfig.backend` whose children are listed one by one: `billing.plans`, `consent.purposes`, `labels.auth`. */
type Paths<T> = {
  [K in keyof T & string]: K extends 'billing' | 'brand' | 'consent' | 'monitoring' | 'legal' | 'labels' ? `${K}.${keyof NonNullable<T[K]> & string}` : K
}[keyof T & string]

/** Every dotted key of {@link BackendAppConfig}, as STABILITY.md §2 lists them. */
export type BackendAppConfigPath = Paths<BackendAppConfig>

/**
 * The frozen `appConfig.backend` surface, one dotted key per entry. `satisfies`
 * ties the list to the type both ways: a key added to {@link BackendAppConfig}
 * without an entry here is a type error, and so is a typo. The surface test
 * pins this list to STABILITY.md §2 and to the customization page.
 */
export const BACKEND_APP_CONFIG_KEYS = [
  'billing.plans',
  'billing.packs',
  'billing.contact',
  'billing.lowCreditsThreshold',
  'consent.purposes',
  'monitoring.feedback',
  'legal.company',
  'legal.address',
  'legal.contact',
  'legal.dpo',
  'legal.host',
  'legal.registration',
  'legal.vat',
  'legal.mediator',
  'legal.locations',
  'legal.processors',
  'legal.storage',
  'legal.contactPoints',
  'legal.moderation',
  'brand.name',
  'brand.logo',
  'brand.address',
  'labels.auth',
  'labels.profile',
  'labels.security',
  'labels.account',
  'labels.reauthenticate',
  'labels.invitation',
  'labels.pricing',
  'labels.settings',
  'labels.history',
  'labels.usage',
  'labels.audit',
  'labels.admin',
  'labels.impersonation',
  'labels.maintenance',
  'labels.announcement',
  'labels.deletion',
  'labels.credits',
  'labels.upgrade',
  'labels.cancelFlow',
  'labels.withdrawal',
  'labels.referral',
  'labels.pastDue',
  'labels.quota',
  'labels.gift',
  'labels.access',
  'labels.waitlist',
  'labels.report',
  'labels.legal',
  'labels.consent',
  'labels.connection',
  'labels.upload',
  'labels.notifications',
  'labels.preferences',
  'labels.contact',
  'labels.shell',
  'labels.onboarding',
  'labels.activation',
  'labels.source',
  'labels.feedback',
  'labels.ai',
  'labels.errors',
] as const satisfies readonly BackendAppConfigPath[]
