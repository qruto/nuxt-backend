import { ACCOUNT_DATA_SOURCES, type AccountDataRecord } from '../account-data.js'
import { BROWSER_STORAGE, type BrowserStorageItem, plainText, SUBPROCESSORS, type Subprocessor } from '../legal.js'
import type { LabelTree } from '../label-format.js'

/** One label per key of a registry, each from its row: the registry's own words, plain. */
function rowLabels<K extends string, R, L extends Record<string, string>>(registry: Record<K, R>, words: (row: R) => L): Record<K, L> {
  return Object.fromEntries((Object.entries(registry) as Array<[K, R]>).map(([key, row]) => [key, words(row)])) as Record<K, L>
}

/**
 * The packaged legal pages (`/legal/privacy`, `/legal/terms`,
 * `/legal/subprocessors`, `/legal/accessibility`), filled from
 * `appConfig.backend.legal`, the brand and the capabilities the app uses.
 * `data`, `processors` and `storage` are the registries' own words
 * (src/convex/account-data.ts, src/convex/legal.ts) without their asides
 * on code: override a row like any other label.
 */
const LEGAL_LABELS = {
  // Above every legal page. Override it with an empty string once your own lawyer reviewed the page.
  disclaimer: 'This page is drawn from what the app runs. It is not legal advice.',
  // In development only, while appConfig.backend.legal lacks fields ({fields}, the missing keys).
  unset: 'Fill in appConfig.backend.legal: {fields}.',
  // How the pages name the app without appConfig.backend.brand.name.
  thisApp: 'this app',
  // The links between the legal pages.
  nav: 'Legal pages',
  pages: {
    privacy: 'Privacy policy',
    terms: 'Terms of service',
    subprocessors: 'Subprocessors',
    accessibility: 'Accessibility statement',
  },
  controller: {
    title: 'Who we are',
    company: '{app} is run by {company}.',
    address: 'Postal address: {address}',
    contact: 'Contact: {contact}',
    dpo: 'Data protection officer: {dpo}',
  },
  privacy: {
    intro: 'This policy says what {app} keeps about you, for how long, who processes it for us, and how you get a copy of it or have it deleted.',
    controller: 'We decide what happens to your personal data: we are its controller.',
    dataTitle: 'What we keep, and for how long',
    dataIntro: 'Each part of the app keeps only what it needs to work for you, and deletes it, or keeps it without your name, as below.',
    holds: 'What we keep',
    kept: 'How long',
    processorsTitle: 'Who processes it for us',
    processorsIntro: 'These services handle personal data on our behalf, only to run the app.',
    processorsLink: 'Every subprocessor, with its agreement',
    storageTitle: 'Cookies and storage in your browser',
    storageIntro: 'We store only what the app needs to work. Anything else waits until you allow it, and you can change your mind at any time.',
    rightsTitle: 'Your rights',
    rightsAccess: 'You can download everything we keep about you, or delete your account, in your security settings. Your data goes from every service above once the deletion\'s grace period ends.',
    rightsAccessLink: 'Security settings',
    rightsCorrect: 'You can correct your name, email address and language in your profile.',
    rightsCorrectLink: 'Profile',
    rightsOther: 'For anything else, or if you have no account, write to {contact}. We answer within a month.',
    rightsOtherNoContact: 'For anything else, or if you have no account, contact us. We answer within a month.',
    rightsComplain: 'You may also complain to the data protection authority where you live or work.',
    changesTitle: 'Changes',
    changes: 'We update this page whenever what we keep changes.',
  },
  terms: {
    intro: 'These terms apply when you use {app}. By using it, you agree to them.',
    accountTitle: 'Your account',
    account: 'You sign in with a code we email you, or with a passkey. Keep your email account and your devices safe: whoever controls them can sign in as you.',
    plansTitle: 'Plans and payments',
    plans: 'A paid plan renews each period until you cancel it. You can cancel at any time in your settings, and keep the plan until the end of the period you paid for.',
    merchant: '{merchant} sells our plans and credits to you as merchant of record, and handles payment, taxes and invoices under its own terms.',
    merchantLink: 'Its terms for buyers',
    withdrawal: 'Where the law gives you a right to withdraw from a purchase, your settings show how while it applies.',
    contentTitle: 'Your content',
    content: 'You keep the rights to what you create. You give us what we need to store it and show it to the people you share it with. Don\'t upload anything illegal, or anything that harms others.',
    report: 'Report content that breaks the law or these terms. A person reviews every report, and the person whose content we restrict hears why and how to appeal.',
    reportLink: 'Report content',
    aiTitle: 'AI features',
    ai: 'Some features use AI models. What they make can be wrong, so check it before you rely on it.',
    endTitle: 'Ending',
    end: 'You can delete your account at any time. We may suspend an account that breaks these terms, and we tell you why.',
    privacy: 'How we handle your data is in our privacy policy.',
    contactTitle: 'Contact',
    contact: 'Questions about these terms: {contact}.',
    changes: 'We tell you before a change to these terms takes effect.',
  },
  subprocessors: {
    intro: 'The services that process personal data for {app}, what each one handles and where it keeps it.',
    name: 'Service',
    processes: 'What it processes',
    location: 'Where',
    agreement: 'Agreement',
    agreementLink: 'Read the agreement',
  },
  accessibility: {
    intro: 'We want everyone to be able to use {app}: with a keyboard, a screen reader, speech input or zoom.',
    standardTitle: 'The standard we follow',
    standard: 'We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA, the web part of the European standard EN 301 549.',
    checkTitle: 'How we check',
    check: 'The sign-in, account, billing and admin pages come from a toolkit built and tested against WCAG 2.2 levels A and AA, with a keyboard, a screen reader and an automated check in light and dark colors. We test the rest of the app ourselves.',
    gapsTitle: 'Known gaps',
    gaps: 'We know of no part of the app that falls short of the standard. If you find one, tell us.',
    reportTitle: 'Report a barrier',
    report: 'Tell us at {contact} what you tried to do and what stopped you, and we will answer.',
    reportNoContact: 'Tell us what you tried to do and what stopped you, and we will answer.',
    authority: 'If our answer does not solve it, you can contact the authority that enforces accessibility law where you live.',
  },
  // The data map's heading for each capability the app uses.
  capabilities: {
    auth: 'Your account',
    data: 'Your files',
    jobs: 'Background work',
    billing: 'Plans and payments',
    email: 'Email',
    notifications: 'Notifications',
    ai: 'AI features',
    protection: 'Bot checks',
    monitoring: 'Error reports',
    flags: 'Feature flags',
    analytics: 'Growth analytics',
    hosting: 'Hosting',
  },
  // What each store of personal data holds, and how long, from the account-data registry.
  data: rowLabels(ACCOUNT_DATA_SOURCES, (source: AccountDataRecord) => ({ holds: plainText(source.holds), kept: plainText(source.retention) })),
  // What each processor handles and where, from src/convex/legal.ts; its name is its own, never a label.
  processors: rowLabels(SUBPROCESSORS, (processor: Subprocessor) => ({ processes: plainText(processor.processes), location: plainText(processor.location) })),
  storageName: 'Name',
  storageKind: 'Kind',
  storageWhy: 'What it is for',
  storageLasts: 'How long',
  storageConsent: 'Permission',
  kinds: {
    cookie: 'Cookie',
    httpOnly: 'Cookie, unreadable by scripts',
    localStorage: 'Local storage',
    sessionStorage: 'Session storage',
    push: 'Push subscription and service worker',
  },
  consents: {
    necessary: 'Not asked: the app needs it',
    preferences: 'Only once you allow preferences',
    replay: 'Only once you allow session replay',
    analytics: 'Only once you allow analytics',
  },
  // Each cookie and storage key the package sets, from src/convex/legal.ts.
  storage: rowLabels(BROWSER_STORAGE, (item: BrowserStorageItem) => ({ why: plainText(item.why), lasts: plainText(item.lasts) })),
} satisfies LabelTree

export default LEGAL_LABELS
