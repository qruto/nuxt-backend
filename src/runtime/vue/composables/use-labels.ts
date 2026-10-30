import { computed, toValue, type ComputedRef, type MaybeRefOrGetter, type VNodeChild } from 'vue'
import { tryUseNuxtApp } from '#imports'
import { findLabel, formatLabel, type LabelParams, type LabelTree } from '../../../convex/label-format.js'
import type { BackendLabels, LabelGroup, LabelGroupOverrides, LabelKey } from '../../../convex/labels.js'
import { translateBackendError } from '../../../convex/errors.js'
import { failureOf, getBackendError, refusalMessage } from '../utils/backend-error'
import { englishLabels } from '../utils/label-registry'
import { useBackendConfig } from './use-backend-config'

export type { BackendLabels, LabelGroup, LabelGroupOverrides, LabelKey, LabelOverrides, LabelParams } from '../../../convex/labels.js'

/** What a rich label fills in: text, or a node of its own (a link, a `<strong>`). */
export type RichLabelParams = Record<string, string | number | VNodeChild>

/** What `useLabels(group)` returns. */
export interface UseLabelsReturn<G extends LabelGroup> {
  /**
   * The label at `key` in the group, filled in: `{name}` takes `params.name`,
   * and `params.count` picks the plural form. The first source that has the
   * key wins: the component's `labels` prop, `appConfig.backend.labels`, the
   * `backend.<group>.<key>` message of `@nuxtjs/i18n`, then English. Reactive:
   * read it in a render function or a `computed`, and it follows a locale
   * switch.
   */
  t: (key: LabelKey<BackendLabels[G]>, params?: LabelParams) => string
  /**
   * The same label as a list of children, with a node where a param is one:
   * `rich('invited', { inviter: h('strong', email) })`. A translation moves
   * the node where its language puts the placeholder.
   */
  rich: (key: LabelKey<BackendLabels[G]>, params?: RichLabelParams) => VNodeChild[]
  /**
   * The sentence to show for a failure, in the active language: a
   * composable's `error`, or anything a call threw, read the way a
   * composable reads it. A catalog refusal reads through the `errors` group;
   * a sentence written for the person stays as written; a failure without a
   * code reads as `errors.unavailable_unexpected`.
   */
  errorMessage: (error: unknown) => string
  /**
   * The label at `group.key` of any group, or `null` when no source has it
   * (not the component's `labels`, not `appConfig.backend.labels`, not a
   * `backend.<group>.<key>` message, not the package's English): for a key
   * your own data names, such as a task's `label`, which is plain text when
   * it is not a key.
   */
  lookup: (key: string, params?: LabelParams) => string | null
  /** The active `@nuxtjs/i18n` locale, or `undefined` without it: for `Intl` dates and numbers. */
  locale: ComputedRef<string | undefined>
}

/** The part of the `@nuxtjs/i18n` global composer this reads. */
interface I18nComposer {
  te: (key: string, locale?: string) => boolean
  t: (key: string, named: Record<string, unknown>, options: { plural?: number, missingWarn: boolean, fallbackWarn: boolean }) => string
  locale: { value: string } | string
  /** The active locale's entry in `i18n.locales`, with its BCP 47 `language` when it names one. */
  localeProperties?: { value?: { language?: string } }
}

/** The `{name}` placeholders of a message. */
const placeholders = (message: string): string[] => [...new Set([...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name!))]

/**
 * A language tag `Intl` accepts, or `undefined` for one it would throw on.
 * An i18n locale code is often a tag already (`fr`, `en-GB`), sometimes
 * one written with an underscore (`pt_BR`), and sometimes no tag at all.
 *
 * @internal
 */
export function intlLocale(tag: string | undefined): string | undefined {
  if (!tag) return undefined
  for (const candidate of [tag, tag.replace(/_/g, '-')]) {
    try {
      return Intl.getCanonicalLocales(candidate)[0]
    }
    catch {
      // Not a tag; try the next spelling.
    }
  }
  return undefined
}

/** The English message at `group.key`, from the groups this page loaded. */
function englishLabel(path: string, warn = false): string | undefined {
  const [group, ...rest] = path.split('.')
  const labels = englishLabels(group!, warn)
  return labels && findLabel(labels, rest.join('.'))
}

/** Overrides already warned about, so a render loop says it once. */
const warnedOverrides = new Set<string>()

/**
 * What an override of the label at `key` (`group.key`) leaves out: the
 * placeholders its English message fills that the override does not name,
 * as an override written for an earlier wording does (`'Upgrade to'` where
 * the message is now `'Upgrade to {plan}'`). The development warning.
 *
 * @internal
 */
export function overrideWarning(key: string, message: string): string | null {
  const english = englishLabel(key)
  const missing = english === undefined ? [] : placeholders(english).filter(name => !message.includes(`{${name}}`))
  if (missing.length === 0) return null
  return `[nuxt-backend] The override of the \`${key}\` label leaves out ${missing.map(name => `{${name}}`).join(', ')}, which its English message fills: "${english}".`
}

/** In development, say once per key when an override leaves a placeholder out (see {@link overrideWarning}). */
function checkOverride(key: string, message: string): void {
  if (!import.meta.dev || warnedOverrides.has(key)) return
  const warning = overrideWarning(key, message)
  if (!warning) return
  warnedOverrides.add(key)
  console.warn(warning)
}

// A node param travels through the formatter, and through vue-i18n's, as a
// marker no message contains; the result is split on the markers.
const OPEN = ''
const CLOSE = ''
const MARKER = new RegExp(`${OPEN}(\\w+)${CLOSE}`, 'g')

/** Whether a value already is a composable's `error` (`{ code, data, message }`), not something a call threw. */
function isFailure(error: unknown): error is { code: string, data: Record<string, unknown>, message: string } {
  return typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { data?: unknown }).data === 'object' && typeof (error as { message?: unknown }).message === 'string'
}

/**
 * The labels of one packaged component's group, resolved for the person
 * reading them. Every word a packaged component or page renders comes
 * through here, and so can an app's own: a page rebuilt from the composables
 * keeps the package's copy, its overrides and its translations.
 *
 * A page loads the English of the groups its code names: write the group
 * out, `useLabels('pricing')` or `lookup('cancelFlow.reasons.price')`, and
 * the module loads that group with the module that names it, for the
 * server's render and the browser's alike. A group named only through a
 * variable shows its keys, and development says so.
 *
 * Works without `@nuxtjs/i18n`. With it, a `backend.<group>.<key>` message in
 * the active locale replaces the English default (the module registers the
 * package's own messages for the app's English, Russian, German, Spanish and
 * French locales), and `locale` follows it.
 *
 * @example
 * ```ts
 * const { t, errorMessage } = useLabels('auth')
 * t('sent', { email: 'ada@example.com' }) // 'We sent a code to ada@example.com.'
 * errorMessage(flow.error.value)          // the refusal, in the active language
 * ```
 */
export function useLabels<G extends LabelGroup>(group: G, overrides?: MaybeRefOrGetter<LabelGroupOverrides<G> | undefined>): UseLabelsReturn<G> {
  const config = useBackendConfig()
  const i18n = (tryUseNuxtApp() as { $i18n?: I18nComposer } | null)?.$i18n

  const currentLocale = () => typeof i18n?.locale === 'string' ? i18n.locale : i18n?.locale.value

  // The locale's language when `i18n.locales` names one, else its code, as a tag `Intl` takes.
  const locale = computed(() => {
    if (!i18n) return undefined
    const code = typeof i18n.locale === 'string' ? i18n.locale : i18n.locale.value
    return intlLocale(i18n.localeProperties?.value?.language) ?? intlLocale(code)
  })

  /** One label of any group, through the four sources in order; without `englishFallback`, the key when only the package's English has it. */
  const resolve = (groupName: LabelGroup, key: string, params: LabelParams, own?: LabelTree, englishFallback = true): string => {
    const path = `${groupName}.${key}`
    const fromProp = own ? findLabel(own, key) : undefined
    const app = (config.labels as Record<string, LabelTree | undefined>)[groupName]
    const override = fromProp ?? (app ? findLabel(app, key) : undefined)
    if (override !== undefined) {
      checkOverride(path, override)
      return formatLabel(override, params)
    }
    const english = englishLabel(path, groupName === group)
    const message = `backend.${path}`
    if (i18n?.te(message)) {
      // A placeholder without a value stays as written, as the formatter
      // leaves it; vue-i18n would leave it out.
      const named: Record<string, unknown> = { ...params }
      for (const name of english === undefined ? [] : placeholders(english)) named[name] ??= `{${name}}`
      // A key this locale leaves out falls back quietly: the package's English is the plan, not a slip.
      const text = i18n.t(message, named, { ...(typeof params.count === 'number' ? { plural: params.count } : {}), missingWarn: false, fallbackWarn: false })
      // `te` answers through the fallback chain, so the package's own English, reached
      // from another locale, does not count as the app's.
      const own = englishFallback || i18n.te(message, currentLocale()) || english === undefined || text !== formatLabel(english, params)
      if (own) return text
    }
    return english === undefined || !englishFallback ? path : formatLabel(english, params)
  }

  const t = (key: string, params: LabelParams = {}) =>
    resolve(group, key, params, toValue(overrides) as LabelTree | undefined)

  const rich = (key: string, params: RichLabelParams = {}): VNodeChild[] => {
    const nodes: Record<string, VNodeChild> = {}
    const text: LabelParams = {}
    for (const [name, value] of Object.entries(params)) {
      if (typeof value === 'string' || typeof value === 'number') text[name] = value
      else {
        nodes[name] = value
        text[name] = `${OPEN}${name}${CLOSE}`
      }
    }
    const children: VNodeChild[] = []
    let last = 0
    const filled = t(key, text)
    for (const match of filled.matchAll(MARKER)) {
      if (match.index > last) children.push(filled.slice(last, match.index))
      children.push(nodes[match[1]!])
      last = match.index + match[0].length
    }
    if (last < filled.length) children.push(filled.slice(last))
    return children
  }

  const anyGroup = (key: string, params: LabelParams = {}, english = true) => {
    const [groupName, ...rest] = key.split('.')
    return resolve(groupName as LabelGroup, rest.join('.'), params, undefined, english)
  }
  const errorMessage = (error: unknown): string =>
    translateBackendError((isFailure(error) ? error : failureOf(error)) as Parameters<typeof translateBackendError>[0], anyGroup, (key, params) => anyGroup(key, params, false))

  const lookup = (key: string, params: LabelParams = {}): string | null => {
    if (!/^[A-Z]\w*(?:\.\w+)+$/i.test(key)) return null
    const text = anyGroup(key, params)
    return text === key ? null : text
  }

  return { t, rich, errorMessage, lookup, locale } as UseLabelsReturn<G>
}

/**
 * The sentence a billing component shows for a failed action: a catalog
 * refusal through the `errors` labels, else the text the error carries
 * (an app's own `ConvexError`, a provider's message), else `fallback`,
 * else `errors.unavailable_unexpected`.
 *
 * @internal
 */
export function refusalText(labels: Pick<UseLabelsReturn<LabelGroup>, 'errorMessage'>, error: unknown, fallback?: string): string {
  return getBackendError(error) ? labels.errorMessage(error) : refusalMessage(error, fallback ?? labels.errorMessage(null))
}

/**
 * The label of a value the server names (an order's status, a role) under
 * `<group>.<subtree>.<value>`, or the value as it came when no label names
 * it: a status the provider added, a role of the app's own.
 *
 * @internal
 */
export function valueLabel<G extends LabelGroup>(labels: Pick<UseLabelsReturn<G>, 't'>, group: G, subtree: string, value: string): string {
  const key = `${subtree}.${value}`
  const text = labels.t(key as LabelKey<BackendLabels[G]>)
  return text === `${group}.${key}` ? value : text
}
