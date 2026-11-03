import type { MeterUnit } from '../../../convex/catalog.js'
import { useLabels } from '../composables/use-labels'
import { inLocale } from './intl'

/** What the packaged labels fill `{unit}` with: a meter's unit in the reader's words. */
export interface MeterUnitWords {
  /**
   * The unit's word for `count`, by the plural rules of the reader's
   * language: the catalog's (`meters.<key>.unit`), else the `credits.unit`
   * labels ("credits"). Without a count, the word for several, as "Buy
   * {unit}" reads it. A plural category the unit does not name reads as
   * `other`.
   */
  word: (unit: MeterUnit | null | undefined, count?: number) => string
  /** The unit as a heading: the catalog's `other` with a capital, else `credits.unitTitle` ("Credits"). */
  title: (unit: MeterUnit | null | undefined) => string
}

/** An amount that reads as several in every language the package speaks: the form "Buy {unit}" takes. */
const SEVERAL = 5

/**
 * A meter's unit in the reader's words, for the packaged labels that
 * interpolate `{unit}` (the `credits`, `usage`, `settings` and `pricing`
 * groups). The fallback is the `credits` group's own words, so an app
 * whose catalog names no unit reads "credits" in every language.
 *
 * @internal
 */
export function useMeterUnit(): MeterUnitWords {
  const { lookup, locale } = useLabels('credits')
  const category = (count: number) => inLocale(locale.value ?? 'en', tag => new Intl.PluralRules(tag).select(count))
  return {
    word: (unit, count = SEVERAL) => {
      const form = category(count)
      if (unit) return unit[form] ?? unit.other
      return lookup(`credits.unit.${form}`) ?? lookup('credits.unit.other') ?? ''
    },
    title: (unit) => {
      if (!unit) return lookup('credits.unitTitle') ?? ''
      return inLocale(locale.value ?? 'en', tag => unit.other.charAt(0).toLocaleUpperCase(tag)) + unit.other.slice(1)
    },
  }
}
